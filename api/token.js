// =====================================================================
//  /api/token  —  Gemini 실시간 음성 대화용 "임시 열쇠(ephemeral token)" 발급
// ---------------------------------------------------------------------
//  - 진짜 Gemini API 키는 서버(Vercel)에만 두고, 짧게만 쓸 수 있는 임시 열쇠를
//    브라우저에 넘겨줘요.
//  - AI 역할 지시문(Ava 면접관 / 지나 튜터)과 목소리 설정을 열쇠 안에 "잠가서" 넣어요.
//
//  Vercel 환경변수(Settings → Environment Variables):
//    GEMINI_API_KEY  (필수) Google AI Studio에서 받은 API 키
//    APP_PASSWORD    (권장) 내 앱 비밀번호
//    LIVE_MODEL      (선택) 기본값 gemini-3.8-live
//    TEXT_MODEL      (선택) 미션·피드백용, 기본값 gemini-3.5-flash
// =====================================================================
const { guard, friendly } = require("../lib/common.js");
const { opicInstructions, ginaInstructions } = require("../lib/prompts.js");
const { cleanMission } = require("./mission.js");

module.exports = async function handler(req, res) {
  const g = guard(req, res);
  if (!g) return;
  const { body, apiKey } = g;

  const mode = ["gina", "topic", "mock"].includes(body.mode) ? body.mode : "topic";
  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";
  const topics = Array.isArray(body.topics)
    ? body.topics.filter((t) => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 40))
    : [];
  const voice = ["Kore", "Puck", "Aoede", "Charon"].includes(body.voice) ? body.voice : "Kore";
  const script = String(body.script || "").slice(0, 7000);
  const model = process.env.LIVE_MODEL || "gemini-3.8-live";
  const pushToTalk = body.turnMode !== "auto"; // 기본: 말하기 버튼 방식

  let instructions;
  if (mode === "gina") {
    if (!body.mission || typeof body.mission !== "object") {
      res.status(400).json({ error: "지나 모드에는 미션 카드가 필요해요." });
      return;
    }
    instructions = ginaInstructions({
      level,
      mission: cleanMission(body.mission),
      backups: String(body.backups || "").slice(0, 2500),
    });
  } else {
    instructions = opicInstructions({ mode, topics, level, script });
  }

  const now = Date.now();
  const tokenRequest = {
    uses: 2, // 연결이 한 번 실패해도 다시 시도할 수 있게 2회
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),        // 열쇠 유효시간 30분
    newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // 2분 안에 연결 시작
    bidiGenerateContentSetup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      systemInstruction: { parts: [{ text: instructions }] },
      inputAudioTranscription: {},  // 내 말 → 글자
      outputAudioTranscription: {}, // AI 말 → 글자
      realtimeInputConfig: {
        automaticActivityDetection: pushToTalk
          // 말하기 버튼 방식: 자동 감지를 끄고, 앱이 "말 시작/끝"을 직접 알려줘요
          ? { disabled: true }
          // 자동 감지 방식: 생각하느라 잠깐 멈춰도 바로 끊지 않도록 "둔감하게" + 2초 기다림
          : { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 2000 },
      },
    },
  };

  try {
    // Google 서버가 바쁘면(503 등) 1초 쉬고 최대 3번까지 시도
    let r, data;
    for (let attempt = 1; attempt <= 3; attempt++) {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(tokenRequest),
      });
      data = await r.json().catch(() => ({}));
      if (r.ok || ![429, 500, 502, 503, 504].includes(r.status)) break;
      console.warn(`token 시도 ${attempt} 실패 (${r.status})`);
      if (attempt < 3) await new Promise((ok) => setTimeout(ok, 1000));
    }
    if (!r.ok || !data.name) {
      console.error("Gemini token error:", data);
      const e = friendly({ status: r.ok ? 500 : r.status, message: data?.error?.message || r.statusText || "임시 열쇠 없음" });
      res.status(e.status).json({ error: "Gemini 연결 준비 오류: " + e.message });
      return;
    }
    res.status(200).json({ token: data.name, model });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "임시 열쇠를 받는 중 오류가 났어요." });
  }
};
