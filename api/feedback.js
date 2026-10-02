// =====================================================================
//  /api/feedback  —  대화 기록을 받아 한국어 피드백 만들기 (Gemini 무료 텍스트 모델)
//  - OPIc 모드: 예상 등급, 개선점, 스크립트 활용도
//  - 지나 모드: 지나 스타일 요약 (잘한 점, 교정, 어휘, 외울 문장)
// =====================================================================
const { guard, generateText } = require("../lib/common.js");
const { feedbackPrompt } = require("../lib/prompts.js");

module.exports = async function handler(req, res) {
  const g = guard(req, res);
  if (!g) return;
  const { body, apiKey } = g;

  const mode = ["gina", "topic", "mock"].includes(body.mode) ? body.mode : "topic";
  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";
  const turns = Array.isArray(body.transcript) ? body.transcript.slice(0, 300) : [];
  const userName = mode === "gina" ? "Learner" : "Candidate";
  const aiName = mode === "gina" ? "Gina" : "Interviewer";
  const text = turns
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => `${t.role === "user" ? userName : aiName}: ${t.text.trim().slice(0, 3000)}`)
    .join("\n");

  if (!text.includes(userName + ":")) {
    res.status(200).json({ feedback: "분석할 내 답변이 없어요. 몇 번 이상 대답한 뒤 종료해 주세요." });
    return;
  }

  try {
    const out = await generateText({
      apiKey,
      system: feedbackPrompt({
        mode,
        level,
        script: String(body.script || "").slice(0, 5000),
        missionTitle: String(body.missionTitle || "").slice(0, 200),
      }),
      user: "TRANSCRIPT:\n" + text,
    });
    res.status(200).json({ feedback: out || "피드백을 받지 못했어요. 잠시 후 다시 시도해 주세요." });
  } catch (err) {
    console.error("feedback error:", err);
    res.status(err.status || 500).json({ error: "피드백 생성 오류: " + err.message });
  }
};
