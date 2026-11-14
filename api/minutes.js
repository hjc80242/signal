export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60");
  const code = String(req.query.code || "").toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(code))
    return res.status(400).json({ error: "종목코드 오류" });
  let errors = [];
  for (const suffix of [".KS", ".KQ"])
    try {
      const symbol = code + suffix,
        r = await fetch(
          "https://query1.finance.yahoo.com/v8/finance/chart/" +
            encodeURIComponent(symbol) +
            "?interval=5m&range=1mo",
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(12000),
          },
        );
      if (!r.ok) throw Error("HTTP " + r.status);
      const j = await r.json(),
        x = j.chart?.result?.[0];
      if (!x?.timestamp?.length) throw Error("원본 없음");
      const q = x.indicators.quote[0],
        candles = [];
      for (let i = 0; i < x.timestamp.length; i++) {
        const open = q.open?.[i],
          high = q.high?.[i],
          low = q.low?.[i],
          close = q.close?.[i];
        const volume = Number(q.volume?.[i]);
        if (
          ![open, high, low, close, volume].every(Number.isFinite) ||
          volume < 0 ||
          low <= 0 ||
          high < Math.max(open, close) ||
          low > Math.min(open, close)
        )
          continue;
        candles.push({
          date: new Date(x.timestamp[i] * 1000).toLocaleString("sv-SE", {
            timeZone: "Asia/Seoul",
            hour12: false,
          }),
          open,
          high,
          low,
          close,
          volume,
        });
      }
      candles.sort((a, b) => a.date.localeCompare(b.date));
      if (candles.length < 50) throw Error("데이터 부족");
      return res.json({
        candles,
        source: "Yahoo Finance 5분봉 최근 1개월",
        symbol,
        asOf: candles.at(-1).date,
        realtimeGuaranteed: false,
      });
    } catch (e) {
      errors.push(suffix + ": " + e.message);
    }
  res.status(503).json({ error: errors.join(" / ") });
}
