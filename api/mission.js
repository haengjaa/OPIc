// =====================================================================
//  /api/mission  —  내 스크립트에서 고른 내용으로 "지나의 오늘의 미션" 카드 만들기
//  (Gemini 무료 텍스트 모델 사용)
// =====================================================================
const { guard, generateText } = require("../lib/common.js");
const { missionPrompt } = require("../lib/prompts.js");

// AI가 준 미션 내용이 형식에 맞는지 확인하고 다듬기
function cleanMission(m) {
  const str = (v, n) => String(v || "").slice(0, n);
  const pairs = (arr, n) =>
    (Array.isArray(arr) ? arr : [])
      .filter((e) => e && e.en)
      .slice(0, n)
      .map((e) => ({ en: str(e.en, 200), ko: str(e.ko, 200) }));

  let dialogue = (Array.isArray(m.dialogue) ? m.dialogue : [])
    .filter((d) => d && d.en)
    .slice(0, 10)
    .map((d) => ({ speaker: /user/i.test(d.speaker) ? "User" : "Teacher", en: str(d.en, 300) }));
  // 규칙: 첫 줄은 Teacher, 마지막 줄은 User
  while (dialogue.length && dialogue[0].speaker !== "Teacher") dialogue.shift();
  while (dialogue.length && dialogue[dialogue.length - 1].speaker !== "User") dialogue.pop();

  return {
    title_ko: str(m.title_ko, 120),
    scenario_ko: str(m.scenario_ko, 600),
    gina_role: str(m.gina_role, 80),
    user_role: str(m.user_role, 80),
    expressions: pairs(m.expressions, 5),
    dialogue,
    tip_ko: str(m.tip_ko, 400),
    followup_expressions: pairs(m.followup_expressions, 2),
    script_fixes: (Array.isArray(m.script_fixes) ? m.script_fixes : [])
      .filter((f) => f && f.before && f.after)
      .slice(0, 3)
      .map((f) => ({ before: str(f.before, 200), after: str(f.after, 200), why_ko: str(f.why_ko, 200) })),
  };
}

module.exports = async function handler(req, res) {
  const g = guard(req, res);
  if (!g) return;
  const { body, apiKey } = g;

  const excerpt = String(body.excerpt || "").slice(0, 3000);
  if (!excerpt.trim()) {
    res.status(400).json({ error: "스크립트 내용이 비어 있어요." });
    return;
  }
  const level = ["IM", "IH", "AL"].includes(body.level) ? body.level : "IH";

  try {
    const text = await generateText({
      apiKey,
      system: missionPrompt({
        level,
        excerpt,
        expressions: Array.isArray(body.expressions) ? body.expressions.slice(0, 10) : [],
        recent: Array.isArray(body.recent) ? body.recent.slice(0, 10) : [],
      }),
      user: "Create today's mission now. Return only the JSON.",
      json: true,
    });
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
    } catch {
      res.status(502).json({ error: "미션 카드를 만들지 못했어요. 다시 시도해 주세요." });
      return;
    }
    const mission = cleanMission(parsed);
    if (!mission.title_ko || mission.dialogue.length < 2) {
      res.status(502).json({ error: "미션 카드 내용이 부족해요. 다시 시도해 주세요." });
      return;
    }
    res.status(200).json({ mission });
  } catch (err) {
    console.error("mission error:", err);
    res.status(err.status || 500).json({ error: "미션 생성 오류: " + err.message });
  }
};

module.exports.cleanMission = cleanMission;
