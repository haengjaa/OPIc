// =====================================================================
//  서버 파일들이 같이 쓰는 도구 모음
// =====================================================================

// 요청 내용 읽기 (Vercel은 JSON을 req.body에 넣어줘요)
function readBody(req) {
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body;
}

// POST 확인 + 비밀번호 확인 + API 키 확인. 문제가 있으면 응답을 보내고 null 반환
function guard(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 가능해요." });
    return null;
  }
  const body = readBody(req);
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && body.password !== appPassword) {
    res.status(401).json({ error: "비밀번호가 틀렸어요." });
    return null;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았어요. Vercel 환경변수를 확인하세요." });
    return null;
  }
  return { body, apiKey };
}

// Gemini 텍스트 모델 호출 (미션 카드, 피드백 만들 때 사용)
async function generateText({ apiKey, system, user, json }) {
  const model = process.env.TEXT_MODEL || process.env.FEEDBACK_MODEL || "gemini-3.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || r.statusText || "Gemini 오류");
    err.status = r.status;
    throw err;
  }
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}

module.exports = { readBody, guard, generateText };
