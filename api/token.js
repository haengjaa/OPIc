// =====================================================================
//  /api/token  —  Gemini 실시간 음성 대화용 "임시 열쇠(ephemeral token)" 발급
// ---------------------------------------------------------------------
//  왜 필요한가요?
//  - 진짜 Gemini API 키를 웹페이지에 넣으면 누구나 훔쳐 쓸 수 있어요.
//  - 그래서 진짜 키는 서버(Vercel)에만 두고, 서버가 짧게만 쓸 수 있는
//    임시 열쇠를 받아 브라우저에 넘겨줍니다.
//  - 면접관 역할 지시문·목소리 같은 설정도 이 열쇠 안에 "잠가서" 넣어요.
//
//  Vercel 환경변수(Settings → Environment Variables):
//    GEMINI_API_KEY  (필수) Google AI Studio에서 받은 API 키
//    APP_PASSWORD    (권장) 내 앱 비밀번호 (다른 사람이 내 무료 사용량을 쓰는 걸 방지)
//    LIVE_MODEL      (선택) 기본값 gemini-3.8-live
// =====================================================================

const LEVEL_GUIDE = {
  IM: "Target level: IM (Intermediate Mid). Use clear, moderately paced English and common vocabulary.",
  IH: "Target level: IH (Intermediate High). Speak at a natural pace. Ask questions that push the candidate to narrate past experiences in detail, describe things vividly, and compare past vs. present.",
  AL: "Target level: AL (Advanced Low). Speak at a natural native pace. Include harder questions: comparisons, social issues, opinions with reasons, and changes over time.",
};

function buildInstructions({ mode, topics, level }) {
  const topicList = topics.length ? topics.join(", ") : "home, neighborhood, movies, music, travel";
  const levelLine = LEVEL_GUIDE[level] || LEVEL_GUIDE.IH;

  const common = `
You are a friendly but professional English speaking test interviewer for an OPIc-style
(Oral Proficiency Interview - computer) practice session. The candidate is a Korean adult.
${levelLine}

STRICT RULES:
- Speak ONLY in English.
- Ask exactly ONE question at a time, then stop talking and wait.
- When the candidate finishes an answer, give at most one very short natural reaction
  (e.g. "I see.", "Thank you.", "That sounds fun.") and then ask the next question.
- Do NOT correct grammar, teach, or give feedback during the interview.
- Do NOT answer your own questions or talk about yourself at length.
- Messages starting with "[APP]" come from the practice app's buttons, not the candidate's speech.
  Follow them silently (do not mention the app or the buttons).
- Keep each question under about 40 words, like real OPIc questions.
- Typical OPIc question styles:
  * Describe: "Tell me about your favorite ... What does it look like?"
  * Routine: "What do you usually do when ...?"
  * Past experience: "Tell me about a memorable experience you had ... What happened?"
  * Compare / change: "How has ... changed compared to the past?"
  * Role-play: "I'd like to give you a situation and ask you to act it out..."
`;

  if (mode === "mock") {
    return (
      common +
      `
MODE: Mock test (about 10 questions — the session has a 15-minute limit).
1. Start with: "Let's start the interview now. Tell me a little bit about yourself."
2. Then 3-question combos on the candidate's survey topics: ${topicList}
   (combo = describe -> routine/habit -> memorable past experience).
3. One unexpected topic question (e.g. recycling, technology, banks, holidays).
4. One role-play: ask the candidate to ask YOU 3-4 questions about something.
5. End with: "That's the end of the interview. Thank you."
Wait for the app's start signal, then begin with the self-introduction question.`
    );
  }

  return (
    common +
    `
MODE: Topic practice. Focus only on these topics: ${topicList}.
For each topic ask a 3-question combo (describe -> routine/habit -> memorable past experience),
then occasionally a compare/change question. Keep going until the candidate ends the session.
Wait for the app's start signal, then give a one-sentence greeting and the first question.`
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 가능해요." });
    return;
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // 1) 비밀번호 확인 (APP_PASSWORD를 설정한 경우에만)
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && body.password !== appPassword) {
    res.status(401).json({ error: "비밀번호가 틀렸어요." });
    return;
  }

  // 2) API 키 확인
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았어요. Vercel 환경변수를 확인하세요." });
    return;
  }

  const mode = body.mode === "mock" ? "mock" : "topic";
  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";
  const topics = Array.isArray(body.topics)
    ? body.topics.filter((t) => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 40))
    : [];
  const voice = ["Kore", "Puck", "Aoede", "Charon"].includes(body.voice) ? body.voice : "Kore";
  const model = process.env.LIVE_MODEL || "gemini-3.8-live";

  const now = Date.now();
  const tokenRequest = {
    uses: 2, // 연결이 한 번 실패해도 다시 시도할 수 있게 2회
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),        // 열쇠 유효시간 30분
    newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // 2분 안에 연결 시작
    // 아래 설정이 열쇠에 잠겨서, 브라우저가 마음대로 바꿀 수 없어요
    bidiGenerateContentSetup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      systemInstruction: { parts: [{ text: buildInstructions({ mode, topics, level }) }] },
      inputAudioTranscription: {},  // 내 말 → 글자
      outputAudioTranscription: {}, // 면접관 말 → 글자
      realtimeInputConfig: {
        automaticActivityDetection: {
          // 생각하느라 잠깐 멈춰도 바로 끊지 않도록 "둔감하게" + 2초 기다림
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          silenceDurationMs: 2000,
        },
      },
    },
  };

  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(tokenRequest),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.name) {
      console.error("Gemini token error:", data);
      res.status(r.ok ? 500 : r.status).json({
        error: "Gemini에서 오류가 났어요: " + (data?.error?.message || r.statusText || "임시 열쇠 없음"),
      });
      return;
    }
    // data.name 이 임시 열쇠예요 ("auth_tokens/..." 형태)
    res.status(200).json({ token: data.name, model });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "임시 열쇠를 받는 중 오류가 났어요." });
  }
};
