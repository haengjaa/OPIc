// =====================================================================
//  /api/script  —  AI 학습용 스크립트 만들기
//  - 내 기존 스크립트(인물·말투)와 OPIc 문제 유형을 참고해서
//    목표 등급(IM/IH/AL)에 맞는 새 스크립트를 내 파일과 같은 형식으로 만들어요.
// =====================================================================
const { guard, generateText } = require("../lib/common.js");
const { scriptGenPrompt } = require("../lib/prompts.js");

module.exports = async function handler(req, res) {
  const g = guard(req, res);
  if (!g) return;
  const { body, apiKey } = g;

  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";
  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.slice(0, 200) : "auto";
  const topicsHave = Array.isArray(body.topicsHave) ? body.topicsHave.filter((t) => typeof t === "string").slice(0, 60) : [];
  const existing = String(body.existing || "").slice(0, 6000);

  try {
    let text = await generateText({
      apiKey,
      system: scriptGenPrompt({ level, topic, topicsHave, existing }),
      user: "Write the new script now, following the OUTPUT FORMAT exactly.",
    });
    text = text.replace(/^```[a-z]*\n?|```$/gim, "").replace(/\*\*/g, "").trim();

    // 첫 줄 "TITLE: ..." 에서 제목 꺼내기
    let title = "";
    const m = text.match(/^\s*TITLE:\s*(.+)$/im);
    if (m) {
      title = m[1].trim().slice(0, 30);
      text = text.replace(m[0], "").trim();
    }
    if (!/[A-Za-z]{3,}/.test(text) || text.length < 200) {
      res.status(502).json({ error: "스크립트가 너무 짧게 만들어졌어요. 다시 시도해 주세요." });
      return;
    }
    res.status(200).json({ title, script: text.slice(0, 20000) });
  } catch (err) {
    console.error("script error:", err);
    res.status(err.status || 500).json({ error: "스크립트 만들기 오류: " + err.message });
  }
};
