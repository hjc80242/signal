const n = (x) =>
  x === null || x === undefined || String(x).trim() === ""
    ? NaN
    : Number(String(x).replace(/,/g, ""));
export default async function handler(req, res) {
  const code = String(req.query.code || "");
  if (!/^[0-9A-Z]{6}$/.test(code))
    return res.status(400).json({ error: "코드 오류" });
  try {
    const base =
        "https://m.stock.naver.com/front-api/stock/domestic/trend?code=" + code,
      cutoff = new Date(Date.now() - 98 * 86400000).toISOString().slice(0, 10),
      rows = new Map();
    let cursor = "",
      pages = 0,
      more = true;
    while (more && pages < 12) {
      const r = await fetch(
          base + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
          { signal: AbortSignal.timeout(8500) },
        ),
        j = await r.json(),
        d = j.result;
      if (!r.ok || !j.isSuccess || !Array.isArray(d?.items))
        throw Error("네이버 수급 응답 오류");
      pages++;
      for (const x of d.items) {
        const date = x.localTradedAt,
          k = x.krx;
        if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const foreign = n(k.foreignNetVolume),
          institution = n(k.organizationNetVolume),
          personal = n(k.individualNetVolume);
        if (![foreign, institution, personal].every(Number.isSafeInteger))
          throw Error("순매매 검증 실패");
        if (date >= cutoff)
          rows.set(date, { date, foreign, institution, personal });
      }
      more = !!(
        d.hasNext &&
        d.cursor &&
        d.items.at(-1)?.localTradedAt >= cutoff &&
        d.cursor !== cursor
      );
      cursor = d.cursor;
    }
    const data = [...rows.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (data.length < 45) throw Error("3개월 수급 부족");
    res.json({
      rows: data,
      source: "네이버 증권 KRX 투자자동향",
      asOf: data.at(-1).date,
      completeMonth: !more,
      partial: more,
    });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
}
