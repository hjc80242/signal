const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { A, bars } = require("./helpers.cjs");
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
test("Wilder RSI: published 14-period example and flat/up/down cases", () => {
  const x = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28,
  ];
  assert.ok(Math.abs(A.rsi(x) - 70.464135) < 1e-5);
  assert.equal(A.rsi(Array(80).fill(10)), 50);
  assert.equal(A.rsi(Array.from({ length: 80 }, (_, i) => i)), 100);
  assert.equal(A.rsi(Array.from({ length: 80 }, (_, i) => 80 - i)), 0);
});
test("known EMA and MACD sequences", () => {
  same(A.ema([10, 20, 30], 3), [10, 15, 22.5]);
  const m = A.macd(Array(100).fill(20));
  assert.ok(m.line.every((x) => x === 0) && m.signal.every((x) => x === 0));
});
test("requires full 60 bars, rejects invalid order or prices", () => {
  const b = bars();
  assert.equal(A.analyze(b.slice(0, 59)).status, "insufficient");
  assert.notEqual(A.analyze(b.slice(0, 60)).status, "insufficient");
  assert.equal(A.analyze([...b].reverse()).status, "insufficient");
  assert.equal(
    A.analyze([...b.slice(0, 60), { ...b[60], close: NaN }]).status,
    "insufficient",
  );
});
test("all decision branches reachable and zone does not follow current price", () => {
  const b = bars(1200);
  const statuses = new Set();
  for (let i = 60; i < b.length; i++)
    statuses.add(A.analyze(b.slice(0, i)).status);
  for (const s of ["review", "wait", "caution"]) assert.ok(statuses.has(s), s);
  const before = A.analyze(b.slice(0, 100)),
    changed = A.analyze([
      ...b.slice(0, 99),
      { ...b[99], close: b[99].close * 0.2 },
    ]);
  assert.equal(before.low, changed.low);
  assert.equal(before.high, changed.high);
  assert.equal(changed.status, "caution");
});
test("future data cannot change earlier analysis across all cuts", () => {
  const b = bars();
  for (let i = 1; i < b.length; i++) {
    const original = A.analyze(b.slice(0, i));
    const poison = [
      ...b.slice(0, i),
      ...b.slice(i).map((x) => ({ ...x, close: 1e12 })),
    ];
    same(A.analyze(poison.slice(0, i)), original);
  }
});
test("OHLC validation, sorting, deduplication", () => {
  const b = bars(3);
  assert.equal(A.normalize([b[2], b[0], b[0], { ...b[1], high: 0 }]).length, 2);
  assert.equal(A.normalize([b[2], b[0]])[0].date, b[0].date);
});
test("daily candle excluded until 15:30 KST, weekly/monthly incomplete excluded", () => {
  const b = bars(1)[0],
    day = { ...b, date: "2026-11-13" };
  assert.equal(
    A.aggregate([day], "day", 5, Date.parse("2026-11-13T06:29:59Z")).length,
    0,
  );
  assert.equal(
    A.aggregate([day], "day", 5, Date.parse("2026-11-13T06:30:00Z")).length,
    1,
  );
  assert.equal(
    A.aggregate([day], "week", 5, Date.parse("2026-11-14T00:00:00Z")).length,
    0,
  );
  assert.equal(
    A.aggregate([day], "month", 5, Date.parse("2026-11-14T00:00:00Z")).length,
    0,
  );
  assert.equal(
    A.aggregate([day], "week", 5, Date.parse("2026-11-16T00:00:00Z")).length,
    1,
  );
});
test("5/10/30/60 minute grouping and exclusion of open buckets", () => {
  const b = bars(12).map((x, i) => ({
    ...x,
    date: "2026-11-13 09:" + String(i * 5).padStart(2, "0") + ":00",
  }));
  for (const n of [5, 10, 30, 60]) {
    const out = A.aggregate(b, "minute", n, Date.parse("2026-11-13T01:00:00Z"));
    assert.equal(out.length, 60 / n);
    assert.equal(out.at(-1).close, b.at(-1).close);
    assert.equal(
      out.reduce((s, x) => s + x.volume, 0),
      b.reduce((s, x) => s + x.volume, 0),
    );
  }
  assert.equal(
    A.aggregate(b, "minute", 60, Date.parse("2026-11-13T00:59:59Z")).length,
    0,
  );
});
