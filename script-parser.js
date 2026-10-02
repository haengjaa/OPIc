// =====================================================================
//  스크립트 파일 분석기
//  - 내 스크립트 텍스트 파일을 "항목"들로 나누고, 무작위로 골라주는 기능
//  - 이렇게 생긴 줄에서 새 항목이 시작돼요:
//      ▶ 공원가기            → 큰 주제
//      [집근처 한강공원 > …] → 소주제 (대괄호로 시작하는 줄)
//      Q. Ask me 3 questions… → 롤플레이 질문
//      DAY 1                 → 핵심 표현 묶음
//      FOOD / SPORT / ETC …  → 표현 목록 (영어 대문자 제목 한 줄)
//      # ====                → 구분선 (무시)
// =====================================================================
(function (root) {
  const ROLEPLAY_HINT = /전화편|질문|구매|묻기|Ask me|약속|^친구한테 전화|^Q\./i;

  function parseScript(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const units = [];
    let category = "기타";
    let cur = null;

    const start = (title, type) => {
      cur = { category, title: title.trim(), type, lines: [] };
      units.push(cur);
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^#\s*=+/.test(line) || /^=+$/.test(line)) continue;

      if (/^▶/.test(line)) {
        category = line.replace(/^▶\s*/, "").trim() || "기타";
        start(category, "topic");
      } else if (/^\[[^\]]+\]/.test(line)) {
        const m = line.match(/^\[([^\]]+)\]\s*-?\s*(.*)$/);
        start(m[1], ROLEPLAY_HINT.test(m[1]) ? "roleplay" : "topic");
        if (m[2]) cur.lines.push(m[2]);
      } else if (/^Q\.\s*/.test(line)) {
        start(line.replace(/^Q\.\s*/, ""), "roleplay");
        cur.lines.push(line);
      } else if (/^DAY\s*\d+\s*$/i.test(line)) {
        category = "핵심 표현";
        start(line.toUpperCase(), "expr");
      } else if (/^[A-Z][A-Z &/]{1,20}$/.test(line)) {
        category = line;
        start(line, "expr");
      } else {
        if (!cur) start(category, "topic");
        cur.lines.push(line);
      }
    }

    // 영어 문장이 하나도 없는 항목은 버리기
    return units
      .filter((u) => u.lines.some((l) => /[A-Za-z]{3,}/.test(l)))
      .map((u, i) => ({
        id: i,
        category: u.category,
        title: u.title,
        type: u.type,
        text: u.lines.join("\n"),
        label: u.category === u.title ? u.title : `${u.category} · ${u.title}`,
      }));
  }

  // 표현 항목에서 영어 표현 한 줄씩 꺼내기 ("A / B" 는 나눠서)
  function expressionPool(units) {
    const pool = [];
    units
      .filter((u) => u.type === "expr")
      .forEach((u) =>
        u.text.split("\n").forEach((l) =>
          l.split(/\s+\/\s+/).forEach((p) => {
            const s = p.replace(/\[[^\]]*\]/g, "").trim();
            if (/[A-Za-z]{3,}/.test(s) && s.split(/\s+/).length >= 2 && s.length <= 160) pool.push(s);
          })
        )
      );
    return [...new Set(pool)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 최근에 쓴 항목(recentLabels)은 되도록 빼고 고르기
  function pickFresh(list, n, recentLabels) {
    const recent = new Set(recentLabels || []);
    const fresh = shuffle(list.filter((u) => !recent.has(u.label)));
    const old = shuffle(list.filter((u) => recent.has(u.label)));
    return fresh.concat(old).slice(0, n);
  }

  // 모드별 무작위 선택
  //  - gina : 주제/롤플레이 1개 + 예비 2개 + 표현 6개
  //  - topic: 서로 다른 주제 3개 + 롤플레이 1개 + 표현 6개
  //  - mock : 서로 다른 주제 4개 + 롤플레이 2개 + 표현 8개
  function pickForSession(units, mode, recentLabels) {
    const content = units.filter((u) => u.type !== "expr");
    const topics = content.filter((u) => u.type === "topic");
    const roleplays = content.filter((u) => u.type === "roleplay");
    const exprs = shuffle(expressionPool(units));

    if (mode === "gina") {
      const main = pickFresh(content, 3, recentLabels);
      return { main: main[0], backups: main.slice(1), expressions: exprs.slice(0, 6) };
    }

    const nTopic = mode === "mock" ? 4 : 3;
    const nRole = mode === "mock" ? 2 : 1;
    // 같은 큰 주제(category)가 겹치지 않게
    const chosen = [];
    const usedCat = new Set();
    for (const u of pickFresh(topics, topics.length, recentLabels)) {
      if (chosen.length >= nTopic) break;
      if (usedCat.has(u.category)) continue;
      usedCat.add(u.category);
      chosen.push(u);
    }
    return {
      topics: chosen,
      roleplays: pickFresh(roleplays, nRole, recentLabels),
      expressions: exprs.slice(0, mode === "mock" ? 8 : 6),
    };
  }

  // 서버(AI)에 보낼 글로 만들기
  function unitToText(u) {
    return `### ${u.label}\n${u.text}`;
  }

  const api = { parseScript, expressionPool, pickForSession, unitToText, shuffle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScriptParser = api;
})(typeof window !== "undefined" ? window : globalThis);
