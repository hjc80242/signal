const { test, expect } = require("@playwright/test");
const { A, bars } = require("./helpers.cjs");
const stocks = [
  ["005930", "삼성전자", 70000],
  ["069500", "KODEX 200", 35000],
  ["102110", "TIGER 200", 36000],
];
async function setup(page, { noMinutes = false, short = false } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split("/").at(-1),
      code = url.searchParams.get("code");
    let data;
    if (name === "symbols")
      data = {
        items: stocks.map(([code, name]) => ({ code, name })),
        sources: ["TEST FIXTURE"],
      };
    if (name === "prices") {
      const b = bars(short ? 10 : 1200, stocks.find((x) => x[0] === code)?.[2]);
      data = {
        candles: b,
        prices: b.map((x) => x.close),
        dates: b.map((x) => x.date),
        source: "TEST FIXTURE — 실제 시세 아님",
      };
    }
    if (name === "minutes") {
      if (noMinutes)
        return route.fulfill({
          status: 503,
          json: { error: "테스트 분봉 미제공" },
        });
      const b = bars(300).map((b, i) => ({
        ...b,
        date: new Date(
          Date.UTC(2024, 0, 2 + Math.floor(i / 72), 9, 5 * (i % 72)),
        )
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
      }));
      data = { candles: b };
    }
    if (name === "breaking-news") data = { items: [] };
    if (name === "markets") data = { series: [] };
    if (name === "flow") data = { rows: [] };
    if (name === "naver-quote") data = { error: "현재가 미제공" };
    await route.fulfill({
      status: ["flow", "markets", "naver-quote"].includes(name) ? 503 : 200,
      json: data || {},
    });
  });
  await page.goto("/");
  return errors;
}
async function search(page, code) {
  await page.locator("#query").fill(code);
  await page.locator("#run").click();
  await expect(page.locator("#results")).toHaveClass("visible");
}
async function consistent(page) {
  const v = await page.evaluate(() => {
    const d = window.signalDaily;
    let b =
      selectedTimeframe === "minute"
        ? aggregateMinutes(window.signalMinute.candles, selectedMinute)
        : SignalAnalysis.aggregate(d.candles, selectedTimeframe);
    b = b.slice(0, historyIndex === null ? b.length : historyIndex + 1);
    return SignalAnalysis.analyze(b);
  });
  await expect(page.locator("#verdict")).toHaveText(v.label);
  await expect(page.locator("#beginnerDecision")).toHaveText(v.label);
  await expect(page.locator("#conclusion h3")).toHaveText(v.label);
  await expect(page.locator("#asof")).toContainText(v.date);
  await expect(page.locator("#conclusion")).toContainText(v.date);
  await expect(page.locator("#analysisTopDate")).toContainText(v.date);
  const colors = await page.evaluate(() =>
    ["verdict", "beginnerDecision"]
      .map((id) => document.getElementById(id).style.color)
      .concat(document.querySelector("#conclusion h3").style.color),
  );
  expect(new Set(colors).size).toBe(1);
  if (v.price !== null)
    await expect(page.locator("#price")).toHaveText(
      Math.round(v.price).toLocaleString("ko-KR") + "원",
    );
  return v;
}
for (const [code, name] of stocks)
  test(
    name +
      " slider first/middle/end, latest, timeframes and mobile layout (synthetic OHLC)",
    async ({ page }) => {
      const errors = await setup(page);
      await search(page, code);
      await consistent(page);
      for (const fraction of [0, 0.5, 1]) {
        await page.locator("#historySlider").evaluate((e, f) => {
          e.value = Math.floor(Number(e.max) * f);
          e.dispatchEvent(new Event("input", { bubbles: true }));
        }, fraction);
        await consistent(page);
      }
      await page.locator("#historyLatest").click();
      await consistent(page);
      for (const tf of ["week", "month", "day"]) {
        await page.locator('[data-tf="' + tf + '"]').click();
        await consistent(page);
      }
      for (const n of [5, 10, 30, 60]) {
        await page.locator('[data-min="' + n + '"]').click();
        await expect(page.locator("#timeframeInfo")).toContainText(
          n + "분봉 ·",
        );
        await consistent(page);
        await expect(page.locator('[data-min="' + n + '"]')).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow).toBe(false);
      expect(errors).toEqual([]);
    },
  );
test("switching stocks resets historical index and minute state", async ({
  page,
}) => {
  const errors = await setup(page);
  await search(page, "005930");
  await page.locator("#historySlider").evaluate((e) => {
    e.value = 70;
    e.dispatchEvent(new Event("input"));
  });
  await search(page, "069500");
  await consistent(page);
  expect(await page.evaluate(() => historyIndex)).toBe(null);
  await expect(page.locator("#name")).toContainText("KODEX 200");
  expect(errors).toEqual([]);
});
test("unavailable minutes clears all daily decisions, prices and conclusions", async ({
  page,
}) => {
  const errors = await setup(page, { noMinutes: true });
  await search(page, "005930");
  await page.locator('[data-min="5"]').click();
  await expect(page.locator("#timeframeInfo")).toContainText("분봉 수신 실패");
  for (const id of ["verdict", "beginnerDecision"])
    await expect(page.locator("#" + id)).toHaveText(
      "⚪ 데이터 부족 · 판단 보류",
    );
  await expect(page.locator("#conclusion h3")).toHaveText(
    "⚪ 데이터 부족 · 판단 보류",
  );
  for (const id of ["price", "entry", "exit"])
    await expect(page.locator("#" + id)).toHaveText("—");
  await page.locator('[data-tf="day"]').click();
  await consistent(page);
  expect(errors).toEqual([]);
});
test("short OHLC history renders gray state without stale targets", async ({
  page,
}) => {
  const errors = await setup(page, { short: true });
  await search(page, "005930");
  const v = await consistent(page);
  expect(v.status).toBe("insufficient");
  await expect(page.locator("#entry")).toHaveText("—");
  await expect(page.locator("#exit")).toHaveText("—");
  expect(errors).toEqual([]);
});
test("future price mutation cannot change selected historical screen or chart", async ({
  page,
}) => {
  await setup(page);
  await search(page, "005930");
  await page.locator("#historySlider").evaluate((e) => {
    e.value = 220;
    e.dispatchEvent(new Event("input"));
  });
  const snapshot = () =>
    page.evaluate(() => ({
      top: document.getElementById("price").textContent,
      conclusion: document.getElementById("conclusion").textContent,
      chart: document.getElementById("priceChart").innerHTML,
      macd: document.getElementById("macdChart").innerHTML,
    }));
  const before = await snapshot();
  await page.evaluate(() => {
    window.signalDaily.candles.slice(221).forEach((b) => {
      b.open = b.high = b.low = b.close = 1e9;
    });
    drawTimeframe();
  });
  expect(await snapshot()).toEqual(before);
  await consistent(page);
});
test("closing-only fallback preserves chart but never invents OHLC or decisions", async ({
  page,
}) => {
  await setup(page);
  await search(page, "005930");
  await page.evaluate(() => {
    window.signalDaily.candles = [];
    drawTimeframe();
  });
  await expect(page.locator("#priceChart polyline")).not.toHaveCount(0);
  await expect(page.locator("#verdict")).toHaveText(
    "⚪ 데이터 부족 · 판단 보류",
  );
  await expect(page.locator("#entry")).toHaveText("—");
  expect(await page.locator("#priceChart").innerHTML()).not.toMatch(
    /NaN|Infinity/,
  );
});
test("320px phone layout and screenshot with explicit synthetic data label", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await search(page, "005930");
  await consistent(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("mobile-fixture.png"),
    fullPage: true,
  });
});
test("phone chart scrolling keeps price, volume and MACD aligned", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await search(page, "005930");
  await expect(page.locator(".chart-scroll")).toHaveCount(3);
  expect(await page.locator(".chart-scroll .chart-scroll").count()).toBe(0);
  await page
    .locator(".chart-scroll")
    .first()
    .evaluate((el) => (el.scrollLeft = 250));
  await expect
    .poll(() =>
      page
        .locator(".chart-scroll")
        .evaluateAll((els) => els.map((el) => el.scrollLeft)),
    )
    .toEqual([250, 250, 250]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
