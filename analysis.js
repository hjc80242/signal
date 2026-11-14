/* Pure technical reference calculations. No network access or orders. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SignalAnalysis = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const colors = {
    review: "#48dca8",
    wait: "#f7c66c",
    caution: "#ff8888",
    insufficient: "#b7bfd1",
  };
  const labels = {
    review: "🟢 매수 검토",
    wait: "🟡 관망",
    caution: "🔴 매수 주의",
    insufficient: "⚪ 데이터 부족 · 판단 보류",
  };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  function ema(a, n) {
    if (!a.length) return [];
    let v = a[0],
      k = 2 / (n + 1);
    return a.map((x) => (v += k * (x - v)));
  }
  function rsi(a, n = 14) {
    if (a.length <= n) return null;
    let gain = 0,
      loss = 0;
    for (let i = 1; i <= n; i++) {
      const d = a[i] - a[i - 1];
      gain += Math.max(d, 0) / n;
      loss += Math.max(-d, 0) / n;
    }
    for (let i = n + 1; i < a.length; i++) {
      const d = a[i] - a[i - 1];
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    }
    return gain === 0 && loss === 0
      ? 50
      : loss === 0
        ? 100
        : 100 - 100 / (1 + gain / loss);
  }
  function macd(a) {
    const fast = ema(a, 12),
      slow = ema(a, 26),
      line = fast.map((v, i) => v - slow[i]),
      signal = ema(line, 9);
    return { line, signal, histogram: line.map((v, i) => v - signal[i]) };
  }
  function analyze(bars) {
    const date = bars.at(-1)?.date || "데이터 없음",
      price = bars.at(-1)?.close ?? null;
    const insufficient = {
      status: "insufficient",
      label: labels.insufficient,
      color: colors.insufficient,
      date,
      price,
      count: bars.length,
    };
    if (
      bars.length < 60 ||
      bars.some(
        (b, i) =>
          !Number.isFinite(b.close) ||
          b.close <= 0 ||
          (i && b.date <= bars[i - 1].date),
      )
    )
      return insufficient;
    const a = bars.map((b) => b.close),
      ma20 = mean(a.slice(-20)),
      ma60 = mean(a.slice(-60)),
      previousMa20 = mean(a.slice(-21, -1)),
      m = macd(a),
      strength = rsi(a);
    // Zone uses prior completed closes, independent of the selected price.
    const prior = a.slice(-21, -1),
      anchor = mean(prior),
      width = Math.max(
        anchor * 0.025,
        (Math.max(...prior) - Math.min(...prior)) / 4,
      ),
      low = Math.max(0, anchor - width),
      high = anchor + width * 0.25;
    const checks = {
      zone: price >= low && price <= high,
      ma: price >= ma20 && ma20 > previousMa20 && price >= ma60,
      macd: m.line.at(-1) > m.signal.at(-1) && m.line.at(-1) > m.line.at(-2),
      rsi: strength >= 50 && strength < 70,
    };
    const status = Object.values(checks).every(Boolean)
      ? "review"
      : price < low ||
          strength >= 70 ||
          (price < ma20 && price < ma60 && m.line.at(-1) < m.signal.at(-1))
        ? "caution"
        : "wait";
    return {
      status,
      label: labels[status],
      color: colors[status],
      date,
      price,
      count: bars.length,
      ma20,
      ma60,
      macd: m.line.at(-1),
      signal: m.signal.at(-1),
      rsi: strength,
      low,
      high,
      target: Math.max(...prior, price + width),
      stop: Math.max(0, Math.min(...prior, ma60, price - width)),
      checks,
    };
  }
  function normalize(bars) {
    if (!Array.isArray(bars)) return [];
    const sorted = bars
      .filter(
        (b) =>
          b &&
          /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(b.date) &&
          ["open", "high", "low", "close", "volume"].every((k) =>
            Number.isFinite(b[k]),
          ) &&
          b.low > 0 &&
          b.volume >= 0 &&
          b.low <= Math.min(b.open, b.close) &&
          b.high >= Math.max(b.open, b.close),
      )
      .map((b) => ({ ...b }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return [...new Map(sorted.map((b) => [b.date, b])).values()];
  }
  function kstTime(date) {
    return Date.parse(
      date.replace(" ", "T") + (date.length === 16 ? ":00" : "") + "+09:00",
    );
  }
  function periodEnd(date, mode) {
    const d = new Date(date.slice(0, 10) + "T00:00:00Z");
    if (mode === "month")
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600000;
    if (mode === "week") {
      d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7));
      return d.getTime() - 9 * 3600000;
    }
    return kstTime(date.slice(0, 10) + " 15:30");
  }
  function completed(bars, mode = "day", minutes = 5, now = Date.now()) {
    return normalize(bars).filter((b) =>
      mode === "minute"
        ? b.date.length > 10 && kstTime(b.date) + 5 * 60000 <= now
        : periodEnd(b.date, "day") <= now,
    );
  }
  function aggregate(bars, mode = "day", minutes = 5, now = Date.now()) {
    const rows = completed(bars, mode, minutes, now);
    if (mode === "day") return rows;
    const groups = new Map();
    for (const b of rows) {
      let key, end;
      if (mode === "minute") {
        const start = kstTime(b.date),
          d = new Date(start + 9 * 3600000),
          minute = d.getUTCHours() * 60 + d.getUTCMinutes(),
          offset = (((minute - 540) % minutes) + minutes) % minutes;
        end = start - offset * 60000 + minutes * 60000;
        key = String(end);
      } else {
        end = periodEnd(b.date, mode);
        key = String(end);
      }
      const old = groups.get(key);
      if (!old) groups.set(key, { ...b, end });
      else {
        old.high = Math.max(old.high, b.high);
        old.low = Math.min(old.low, b.low);
        old.close = b.close;
        old.volume += b.volume;
        old.date = b.date;
      }
    }
    return [...groups.values()]
      .filter((b) => b.end <= now)
      .map(({ end, ...b }) => b);
  }
  return {
    analyze,
    ema,
    rsi,
    macd,
    normalize,
    aggregate,
    completed,
    colors,
    labels,
  };
});
