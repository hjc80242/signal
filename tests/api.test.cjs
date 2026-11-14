const { test } = require("node:test"),
  assert = require("node:assert/strict");
async function invoke(
  name,
  query = {},
  fetcher = () => {
    throw Error("Unexpected network");
  },
) {
  const saved = global.fetch;
  global.fetch = fetcher;
  const { default: handler } = await import("../api/" + name + ".js");
  const res = {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(d) {
      this.data = d;
      return this;
    },
  };
  try {
    await handler({ query }, res);
    return res;
  } finally {
    global.fetch = saved;
  }
}
test("price/minute/flow reject invalid codes without upstream requests", async () => {
  for (const name of ["prices", "minutes", "flow"]) {
    const r = await invoke(name, { code: "../bad" });
    assert.equal(r.code, 400);
  }
});
test("prices XML validation, ascending date order, deduplication and 1600-bar request", async () => {
  const entries = Array.from(
    { length: 65 },
    (_, i) =>
      `<item data="${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10).replaceAll("-", "")}|100|110|90|105|1000"/>`,
  );
  const r = await invoke("prices", { code: "005930" }, async (url) => {
    assert.match(url, /count=1600/);
    return {
      ok: true,
      text: async () =>
        entries.reverse().join("") +
        entries[0] +
        '<item data="20260101|100|90|110|105|1000"/>',
    };
  });
  assert.equal(r.code, 200);
  assert.equal(r.data.candles.length, 65);
  assert.ok(r.data.dates.every((d, i, a) => !i || d > a[i - 1]));
  assert.equal(r.data.prices[0], 105);
});
test("prices upstream failures return no invented prices", async () => {
  const r = await invoke("prices", { code: "069500" }, async () => ({
    ok: false,
    status: 503,
  }));
  assert.equal(r.code, 502);
  assert.equal(r.data.prices, undefined);
});
test("flow null investor data is rejected rather than converted to zero", async () => {
  const r = await invoke("flow", { code: "005930" }, async () => ({
    ok: true,
    json: async () => ({
      isSuccess: true,
      result: {
        items: [
          {
            localTradedAt: new Date().toISOString().slice(0, 10),
            krx: {
              foreignNetVolume: null,
              organizationNetVolume: "100",
              individualNetVolume: "-100",
            },
          },
        ],
      },
    }),
  }));
  assert.equal(r.code, 503);
  assert.match(r.data.error, /검증 실패/);
});
test("minute timestamps converted to KST and invalid OHLC omitted", async () => {
  const count = 55,
    r = await invoke("minutes", { code: "069500" }, async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              timestamp: Array.from(
                { length: count },
                (_, i) => Date.parse("2025-11-14T00:00:00Z") / 1000 + i * 300,
              ),
              indicators: {
                quote: [
                  {
                    open: Array(count).fill(100),
                    high: Array.from({ length: count }, (_, i) =>
                      i === 0 ? 80 : 110,
                    ),
                    low: Array(count).fill(90),
                    close: Array(count).fill(105),
                    volume: Array(count).fill(1000),
                  },
                ],
              },
            },
          ],
        },
      }),
    }));
  assert.equal(r.code, 200);
  assert.equal(r.data.candles.length, 54);
  assert.equal(r.data.candles[0].date, "2025-11-14 09:05:00");
  assert.equal(r.data.realtimeGuaranteed, false);
});
test("reconstructed news excludes future and unsafe links, reports partial failure", async () => {
  let n = 0;
  const r = await invoke("breaking-news", {}, async () => {
    if (n++) throw Error("unavailable");
    return {
      ok: true,
      text: async () =>
        `<item><title>삼성전자 속보</title><link>javascript:alert(1)</link><pubDate>${new Date().toUTCString()}</pubDate></item><item><title>코스피 급등</title><link>https://example.com/future</link><pubDate>${new Date(Date.now() + 86400000).toUTCString()}</pubDate></item><item><title>연준 금리 발표</title><link>https://example.com/news</link><pubDate>${new Date().toUTCString()}</pubDate></item>`,
    };
  });
  assert.equal(r.code, 200);
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.partial, true);
});
test("naver quote explicitly reports unsupported current quote", async () => {
  const r = await invoke("naver-quote");
  assert.equal(r.code, 503);
  assert.equal(r.data.price, undefined);
});
