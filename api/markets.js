export default async function handler(req, res) {
  const symbols = [
    ["나스닥 종합", "%5EIXIC"],
    ["코스피", "%5EKS11"],
    ["코스닥", "%5EKQ11"],
  ];
  const series = [];
  const errors = [];
  await Promise.all(
    symbols.map(async ([name, symbol]) => {
      try {
        const url =
          "https://query1.finance.yahoo.com/v8/finance/chart/" +
          symbol +
          "?range=2y&interval=1d";
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          signal: AbortSignal.timeout(9000),
        });
        if (!r.ok) throw Error("HTTP " + r.status);
        const d = await r.json(),
          x = d.chart?.result?.[0];
        if (!x) throw Error("데이터 없음");
        const prices = [],
          dates = [],
          q = x.indicators?.quote?.[0]?.close || [];
        for (let i = 0; i < q.length; i++) {
          if (
            Number.isFinite(q[i]) &&
            q[i] > 0 &&
            Number.isFinite(x.timestamp?.[i])
          ) {
            prices.push(q[i]);
            dates.push(
              new Date(x.timestamp[i] * 1000).toISOString().slice(0, 10),
            );
          }
        }
        if (prices.length < 5) throw Error("가격 부족");
        series.push({ name, prices, dates });
      } catch (e) {
        errors.push(name + ": " + e.message);
      }
    }),
  );
  series.sort(
    (a, b) =>
      symbols.findIndex((x) => x[0] === a.name) -
      symbols.findIndex((x) => x[0] === b.name),
  );
  res.setHeader(
    "Cache-Control",
    "public,s-maxage=300,stale-while-revalidate=300",
  );
  res.status(series.length ? 200 : 502).json({
    series,
    errors,
    source: "Yahoo Finance 일별 종가 (지연 가능)",
    error: series.length ? undefined : "세 지수 모두 조회 실패",
  });
}
