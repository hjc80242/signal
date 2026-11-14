export default async function handler(req, res) {
  const code = String(req.query.code || "").toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(code))
    return res.status(400).json({ error: "종목코드 오류" });
  try {
    const r = await fetch(
      "https://fchart.stock.naver.com/sise.nhn?symbol=" +
        code +
        "&timeframe=day&count=1600&requestType=0",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://finance.naver.com/",
        },
        signal: AbortSignal.timeout(9000),
      },
    );
    if (!r.ok) throw Error("원본 시세 응답 " + r.status);
    const xml = await r.text(),
      candles = [];
    for (const m of xml.matchAll(/<item[^>]*data="([0-9|.]+)"/g)) {
      const a = m[1].split("|");
      if (a.length < 6) continue;
      const [date, open, high, low, close, volume] = [
        a[0],
        ...a.slice(1, 6).map(Number),
      ];
      if (
        !/^\d{8}$/.test(date) ||
        ![open, high, low, close, volume].every(Number.isFinite) ||
        volume < 0 ||
        low <= 0 ||
        high < low ||
        open < low ||
        open > high ||
        close < low ||
        close > high
      )
        continue;
      candles.push({
        date:
          date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6, 8),
        open,
        high,
        low,
        close,
        volume,
      });
    }
    const ordered = [...new Map(candles.map((b) => [b.date, b])).values()].sort(
      (a, b) => a.date.localeCompare(b.date),
    );
    candles.splice(0, candles.length, ...ordered);
    if (candles.length < 20) throw Error("유효한 봉 데이터 부족");
    res.setHeader("Cache-Control", "s-maxage=600");
    return res.json({
      prices: candles.map((b) => b.close),
      dates: candles.map((b) => b.date),
      candles,
      source: "네이버 금융 일별 OHLC",
      validation: "원본 시가·고가·저가·종가·거래량 확인",
    });
  } catch (e) {
    return res.status(502).json({ error: "가격 조회 실패: " + e.message });
  }
}
