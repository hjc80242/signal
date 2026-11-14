const clean = (s) =>
  String(s || "")
    .trim()
    .normalize("NFC");
async function get(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://finance.naver.com/",
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw Error("upstream");
  const b = await r.arrayBuffer();
  let t = new TextDecoder("utf-8").decode(b);
  if (t.includes("�")) t = new TextDecoder("euc-kr").decode(b);
  return t;
}
export default async function handler(req, res) {
  const items = new Map(),
    sources = [];
  await Promise.allSettled([
    (async () => {
      const d = JSON.parse(
        await get("https://finance.naver.com/api/sise/etfItemList.nhn"),
      );
      for (const x of d.result?.etfItemList || []) {
        const code = clean(x.itemcode).toUpperCase(),
          name = clean(x.itemname);
        if (/^[0-9A-Z]{6}$/.test(code) && name && !name.includes("�"))
          items.set(code, { code, name, market: "ETF" });
      }
      sources.push("ETF");
    })(),
    (async () => {
      const csv = await get(
        "https://raw.githubusercontent.com/benjaminpo/finance-dataset/main/config/listings/krx-listed-symbols.csv",
      );
      for (const row of csv.split(/\r?\n/)) {
        const m = row.match(/^([0-9A-Z]{6})\.(KS|KQ),([^,]+)/);
        if (m && !m[3].includes("�"))
          items.set(m[1], { code: m[1], name: m[3], market: m[2] });
      }
      sources.push("주식");
    })(),
  ]);
  res.setHeader("Cache-Control", "public,s-maxage=3600");
  const code = clean(req.query.code).toUpperCase();
  if (code) {
    const x = items.get(code);
    return res.status(x ? 200 : 404).json(x || { error: "종목명 없음" });
  }
  return res.json({ items: [...items.values()], sources, count: items.size });
}
