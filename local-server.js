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
  "/api/mission": require("./api/mission.js"),
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
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

    const urlPath = req.url.split("?")[0];
    const handler = routes[urlPath];
    if (handler) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
        await handler(req, res);
      });
      return;
    }

    // 화면 파일 보내기 (index.html, manifest.json, sw.js, icons/...)
    const rel = urlPath === "/" ? "index.html" : urlPath.slice(1);
    const file = path.join(__dirname, rel);
    const allowed = file.startsWith(__dirname) && !rel.startsWith("api") && !rel.startsWith("lib") && !rel.startsWith(".") && TYPES[path.extname(file)];
    if (allowed && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader("Content-Type", TYPES[path.extname(file)]);
      res.end(fs.readFileSync(file));
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => {
    console.log(`✅ 실행 중!  브라우저에서 열기 → http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY) console.log("⚠️  GEMINI_API_KEY 가 없어요. .env 파일을 확인하세요.");
  });
