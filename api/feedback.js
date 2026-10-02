// =====================================================================
//  /api/feedback  —  대화 기록을 받아 한국어 피드백 만들기 (Gemini 무료 텍스트 모델)
//  환경변수:
//    GEMINI_API_KEY  (필수)
//    APP_PASSWORD    (권장)
//    FEEDBACK_MODEL  (선택) 기본값 gemini-3.5-flash
// =====================================================================

const COACH_PROMPT = `
You are an expert OPIc speaking coach. Below is a transcript of an OPIc-style practice interview
(Interviewer = AI, Candidate = Korean learner). The candidate's lines come from automatic speech
recognition, so ignore small recognition errors that are obviously not the speaker's fault.

Review ONLY the candidate's answers and write feedback IN KOREAN. Be honest and specific.
If there were very few or very short answers, say so clearly.
Use plain text (no markdown tables, no ** bold). Format:

[예상 등급] 예: "IM2~IM3 수준으로 추정" — 반드시 "추정"이라고 쓰고, 실제 시험과 다를 수 있다고 한 줄 덧붙이기

[잘한 점] 2~3개

[개선할 점] 3~5개 — 문법, 시제(특히 과거 경험 질문의 과거시제), 연결어, 답변 길이와 구성(도입-본론-마무리), 구체적 묘사

[이렇게 고쳐보세요] 후보자가 실제로 한 문장 3~5개를 그대로 인용 → 더 자연스러운 영어 문장 + 짧은 한국어 설명

[다음 연습 팁] 1~2줄
`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 가능해요." });
    return;
  }
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && body.password !== appPassword) {
    res.status(401).json({ error: "비밀번호가 틀렸어요." });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았어요." });
    return;
  }

  // 대화 기록 정리 (너무 길면 자르기)
  const turns = Array.isArray(body.transcript) ? body.transcript.slice(0, 200) : [];
  const text = turns
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.text.trim().slice(0, 3000)}`)
    .join("\n");
  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";

  if (!text.includes("Candidate:")) {
    res.status(200).json({ feedback: "분석할 내 답변이 없어요. 질문에 몇 개 이상 대답한 뒤 종료해 주세요." });
    return;
  }

  const model = process.env.FEEDBACK_MODEL || "gemini-3.5-flash";
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: COACH_PROMPT + `\nThe candidate's target level is ${level}.` }] },
          contents: [{ role: "user", parts: [{ text: "TRANSCRIPT:\n" + text }] }],
        }),
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Gemini feedback error:", data);
      res.status(r.status).json({ error: "피드백 생성 오류: " + (data?.error?.message || r.statusText) });
      return;
    }
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    res.status(200).json({ feedback: out || "피드백을 받지 못했어요. 잠시 후 다시 시도해 주세요." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "피드백을 만드는 중 오류가 났어요." });
  }
};
