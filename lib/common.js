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

// ---------------------------------------------------------------------
//  Gemini 텍스트 모델 호출 (미션 카드, 피드백 만들 때 사용)
//  - Google 서버가 바쁘면(503) 잠깐 기다렸다가 다시 시도하고,
//    그래도 안 되면 다른 무료 모델로 바꿔서 시도해요.
//  - 순서: TEXT_MODEL(환경변수) → gemini-3.5-flash → gemini-3.5-flash-lite → gemini-3.1-flash-lite
// ---------------------------------------------------------------------
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const RETRY_STATUS = [429, 500, 502, 503, 504]; // 다시 시도해볼 만한 오류
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel({ apiKey, model, system, user, json }) {
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
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) {
    const err = new Error("빈 응답");
    err.status = 503;
    throw err;
  }
  return text;
}

async function generateText({ apiKey, system, user, json }) {
  const first = process.env.TEXT_MODEL || process.env.FEEDBACK_MODEL;
  const models = [...new Set([first, ...FALLBACK_MODELS].filter(Boolean))];
  let lastErr;

  for (const model of models) {
    // 모델마다 최대 2번 시도 (1초 쉬고 한 번 더)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await callModel({ apiKey, model, system, user, json });
        if (model !== models[0]) console.log(`ℹ️ ${models[0]} 대신 ${model} 사용`);
        return text;
      } catch (err) {
        lastErr = err;
        console.warn(`Gemini ${model} 시도 ${attempt} 실패 (${err.status}): ${err.message}`);
        if (err.status === 404) break;                    // 모델 이름이 없으면 바로 다음 모델로
        if (!RETRY_STATUS.includes(err.status)) throw friendly(err); // 키 오류 등은 바로 알려주기
        if (attempt === 1) await sleep(1000);
      }
    }
  }
  throw friendly(lastErr);
}

// 사용자에게 보여줄 쉬운 한국어 오류 문구
function friendly(err) {
  const e = new Error(err?.message || "알 수 없는 오류");
  e.status = err?.status || 500;
  if (e.status === 503 || e.status === 500 || e.status === 502 || e.status === 504) {
    e.message = "지금 Google AI 서버가 많이 바빠요 (503). 여러 번 다시 시도했지만 실패했어요. 1~2분 뒤에 다시 눌러주세요.";
  } else if (e.status === 429) {
    e.message = "무료 사용량 한도에 걸렸어요 (429). 1분쯤 뒤에 다시 시도하고, 계속되면 오늘 사용량을 다 쓴 것일 수 있어요.";
  } else if (e.status === 400 && /API key/i.test(err?.message || "")) {
    e.message = "Gemini API 키가 올바르지 않아요. Vercel의 GEMINI_API_KEY를 확인해주세요.";
  }
  return e;
}

module.exports = { readBody, guard, generateText, friendly };
