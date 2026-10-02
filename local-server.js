// =====================================================================
//  내 컴퓨터에서 테스트할 때만 쓰는 서버 (Vercel 배포에는 필요 없어요)
//  실행:  npm start   →  브라우저에서 http://localhost:3000
//  (.env 파일에 GEMINI_API_KEY=... 를 먼저 적어두세요)
// =====================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");

const routes = {
  "/api/token": require("./api/token.js"),
  "/api/feedback": require("./api/feedback.js"),
};
const PORT = 3000;

http
  .createServer((req, res) => {
    // Vercel처럼 res.status().json() 을 쓸 수 있게 흉내내기
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(obj));
    };

    const handler = routes[req.url];
    if (handler) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
        await handler(req, res);
      });
      return;
    }

    if (req.url === "/" || req.url === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(fs.readFileSync(path.join(__dirname, "index.html")));
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => {
    console.log(`✅ 실행 중!  브라우저에서 열기 → http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY) console.log("⚠️  GEMINI_API_KEY 가 없어요. .env 파일을 확인하세요.");
  });
