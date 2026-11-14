const decode = (s) =>
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/<[^>]*>/g, "")
      .trim(),
  tag = (s, k) =>
    decode(
      s.match(
        new RegExp("<" + k + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + k + ">", "i"),
      )?.[1],
    );
const relevant =
    /코스피|코스닥|나스닥|증시|환율|금리|연준|반도체|관세|경제|유가|전쟁|미국|중국|물가|엔비디아|삼성전자/i,
  urgent =
    /긴급|속보|급락|폭락|급등|전쟁|관세|금리 인상|금리 인하|FOMC|연준|파산/i;
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=240");
  const qs = [
    "(코스피 OR 코스닥 OR 나스닥 OR 증시) (속보 OR 급락 OR 급등 OR 금리 OR 관세) when:2d",
    "(연준 OR FOMC OR 환율 OR 반도체 OR 전쟁 OR 유가) (속보 OR 발표 OR 급등 OR 급락) when:2d",
  ];
  const replies = await Promise.allSettled(
      qs.map(async (q) => {
        const r = await fetch(
          "https://news.google.com/rss/search?q=" +
            encodeURIComponent(q) +
            "&hl=ko&gl=KR&ceid=KR:ko",
          { signal: AbortSignal.timeout(9000) },
        );
        if (!r.ok) throw Error("RSS");
        return r.text();
      }),
    ),
    items = [],
    seen = new Set();
  for (const p of replies) {
    if (p.status !== "fulfilled") continue;
    for (const m of p.value.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const s = m[1],
        title = tag(s, "title"),
        url = tag(s, "link"),
        published = Date.parse(tag(s, "pubDate"));
      if (
        !title ||
        !/^https:\/\//i.test(url) ||
        !Number.isFinite(published) ||
        published > Date.now() + 60000 ||
        Date.now() - published > 48 * 3600000 ||
        !relevant.test(title)
      )
        continue;
      const id = title.toLowerCase().replace(/\s+/g, " ").slice(0, 140);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        title,
        url,
        published: new Date(published).toISOString(),
        source: tag(s, "source") || "Google 뉴스",
        market: /나스닥|미국|연준|FOMC/i.test(title)
          ? "미국·한국"
          : "국내·글로벌 증시",
        level: urgent.test(title) ? "긴급 후보" : "주요 뉴스",
      });
    }
  }
  items.sort(
    (a, b) =>
      (a.level === "긴급 후보" ? 0 : 1) - (b.level === "긴급 후보" ? 0 : 1) ||
      Date.parse(b.published) - Date.parse(a.published),
  );
  if (!replies.some((x) => x.status === "fulfilled"))
    return res.status(503).json({ error: "뉴스 연결 실패" });
  res.json({
    items: items.slice(0, 16),
    partial: replies.some((x) => x.status === "rejected"),
  });
}
