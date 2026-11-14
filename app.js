const $ = (id) => document.getElementById(id);
const known = {
  삼성전자: "005930",
  sk하이닉스: "000660",
  네이버: "035420",
  naver: "035420",
  카카오: "035720",
  현대차: "005380",
  기아: "000270",
  삼성바이오로직스: "207940",
  셀트리온: "068270",
  두산에너빌리티: "034020",
  "kodex 200": "069500",
  "tiger 200": "102110",
  "tiger 미국s&p500": "360750",
  "tiger 미국나스닥100": "133690",
};
let catalog = [],
  catalogLoaded = false;
fetch("/api/symbols")
  .then((r) => r.json())
  .then((d) => {
    catalog = (d.items || []).filter((x) => x.name && !x.name.includes("�"));
    catalogLoaded = catalog.length > 1000;
    $("catalogStatus").textContent = catalogLoaded
      ? "종목 목록 " +
        catalog.length.toLocaleString() +
        "개 로드됨 (" +
        (d.sources || []).join(", ") +
        ")"
      : "전체 목록 로드 실패 · 코드 입력 가능";
  })
  .catch(
    () =>
      ($("catalogStatus").textContent = "종목 목록 조회 실패 · 코드 입력 가능"),
  );
let selected = null;
const queryInput = $("query"),
  suggestionBox = $("suggestions");
function suggest() {
  selected = null;
  const q = queryInput.value.trim().toLowerCase();
  suggestionBox.replaceChildren();
  if (!q) {
    suggestionBox.style.display = "none";
    return;
  }
  const matches = catalog
    .filter(
      (x) =>
        x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(q)) -
        Number(!b.name.toLowerCase().startsWith(q)),
    )
    .slice(0, 12);
  suggestionBox.style.display = matches.length ? "block" : "none";
  for (const x of matches) {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText =
      "width:100%;text-align:left;background:#17243a;margin:2px 0";
    b.textContent = x.name + " · " + x.code;
    b.onclick = () => {
      selected = x;
      queryInput.value = x.name;
      suggestionBox.style.display = "none";
    };
    suggestionBox.append(b);
  }
}
queryInput.addEventListener("input", suggest);
queryInput.addEventListener("focus", suggest);
const money = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function line(svg, values, color, min, max) {
  const pts = values
    .map((v, i) =>
      Number.isFinite(v)
        ? `${((i / Math.max(1, values.length - 1)) * 570 + 15).toFixed(1)},${(210 - ((v - min) / (max - min || 1)) * 185).toFixed(1)}`
        : null,
    )
    .filter(Boolean)
    .join(" ");
  const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  el.setAttribute("points", pts);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", "2.7");
  svg.appendChild(el);
}
function chart(prices, dates) {
  const svg = $("priceChart");
  svg.replaceChildren();
  const start = Math.max(0, prices.length - 90),
    recent = prices.slice(start);
  const avg = (n) =>
    prices.map((_, i) =>
      i >= n - 1 ? mean(prices.slice(i - n + 1, i + 1)) : null,
    );
  const full20 = avg(20),
    ma20 = full20.slice(start),
    ma60 = avg(60).slice(start);
  const all = [...recent, ...ma20, ...ma60].filter(Number.isFinite),
    min = Math.min(...all) * 0.985,
    max = Math.max(...all) * 1.015;
  line(svg, recent, "#66b2ff", min, max);
  line(svg, ma20, "#ffcb6a", min, max);
  line(svg, ma60, "#8ae6bd", min, max);
  const ns = "http://www.w3.org/2000/svg",
    y = (v) => 210 - ((v - min) / (max - min || 1)) * 185;
  let buys = 0,
    sells = 0;
  for (let i = Math.max(20, start + 1); i < prices.length; i++) {
    const crossUp = prices[i - 1] <= full20[i - 1] && prices[i] > full20[i];
    const crossDown = prices[i - 1] >= full20[i - 1] && prices[i] < full20[i];
    if (!crossUp && !crossDown) continue;
    const strength = rsi(prices.slice(0, i + 1));
    const buy = crossUp && strength >= 50 && strength < 75;
    const sell = crossDown && strength < 50;
    if (!buy && !sell) continue;
    const x = 15 + ((i - start) / (recent.length - 1)) * 570,
      yy = y(prices[i]);
    const arrow = document.createElementNS(ns, "text");
    arrow.setAttribute("x", x);
    arrow.setAttribute("y", Math.max(24, Math.min(216, yy + (buy ? 19 : -12))));
    arrow.setAttribute("text-anchor", "middle");
    arrow.setAttribute("font-size", "23");
    arrow.setAttribute("font-weight", "bold");
    arrow.setAttribute("fill", buy ? "#40e3a0" : "#ff727f");
    arrow.textContent = buy ? "▲" : "▼";
    const tip = document.createElementNS(ns, "title");
    tip.textContent =
      (dates?.[i] || "") +
      " " +
      (buy ? "매수 관찰" : "매도 관찰") +
      " · 종가 " +
      money(prices[i]) +
      " · RSI " +
      strength.toFixed(1);
    arrow.appendChild(tip);
    svg.appendChild(arrow);
    if (buy) buys++;
    else sells++;
  }
  const t = document.createElementNS(ns, "text");
  t.setAttribute("x", "15");
  t.setAttribute("y", "15");
  t.setAttribute("fill", "#b9c8de");
  t.setAttribute("font-size", "13");
  t.textContent = "종가(파랑) · MA20(노랑) · MA60(초록)";
  svg.appendChild(t);
  // X축: 실제 거래일 기준 날짜 표기 (월/일)
  const axis = document.createElementNS(ns, "line");
  axis.setAttribute("x1", "15");
  axis.setAttribute("x2", "585");
  axis.setAttribute("y1", "230");
  axis.setAttribute("y2", "230");
  axis.setAttribute("stroke", "#50617e");
  svg.appendChild(axis);
  const count = Math.min(6, recent.length);
  for (let j = 0; j < count; j++) {
    const idx = Math.round((j * (recent.length - 1)) / (count - 1)),
      x = 15 + (idx / (recent.length - 1)) * 570;
    const tick = document.createElementNS(ns, "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("x2", x);
    tick.setAttribute("y1", "230");
    tick.setAttribute("y2", "235");
    tick.setAttribute("stroke", "#8293ad");
    svg.appendChild(tick);
    const tx = document.createElementNS(ns, "text");
    tx.setAttribute("x", x);
    tx.setAttribute("y", "250");
    tx.setAttribute(
      "text-anchor",
      j === 0 ? "start" : j === count - 1 ? "end" : "middle",
    );
    tx.setAttribute("fill", "#b9c8de");
    tx.setAttribute("font-size", "12");
    const date = dates?.[start + idx] || "";
    tx.textContent = date.slice(5).replace("-", "/");
    svg.appendChild(tx);
  }
  const summary = $("signalCount");
  if (summary)
    summary.textContent = `최근 ${recent.length}거래일: 매수 관찰 ${buys}회 · 매도 관찰 ${sells}회 · 화살표에 마우스를 올리면 날짜와 가격 표시`;
}
const ema = SignalAnalysis.ema,
  rsi = SignalAnalysis.rsi;
function render(data, code, label) {
  const candles = SignalAnalysis.normalize(data.candles);
  window.signalDaily = {
    prices: data.prices || [],
    dates: data.dates || [],
    candles,
    code,
  };
  historyIndex = null;
  window.signalMinute = null;
  $("results").classList.add("visible");
  $("name").textContent =
    (label === code ? "종목명 확인 불가" : label) + " · " + code;
  $("news").replaceChildren();
  for (const [name, url] of [
    [
      "네이버 뉴스",
      "https://search.naver.com/search.naver?where=news&query=" +
        encodeURIComponent(label),
    ],
    ["DART 공시 검색", "https://dart.fss.or.kr/dsab007/main.do"],
    ["KRX 공시(KIND)", "https://kind.krx.co.kr/"],
  ]) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = name + " ↗";
    $("news").append(a);
  }
  drawTimeframe();
  if (selectedTimeframe === "minute") loadMinute();
}
$("form").onsubmit = async (e) => {
  e.preventDefault();
  const raw = $("query").value.trim(),
    matches = catalog.filter(
      (x) =>
        x.name.toLowerCase() === raw.toLowerCase() ||
        x.code === raw.toUpperCase(),
    );
  const item = selected || (matches.length === 1 ? matches[0] : null);
  const code =
    item?.code ||
    known[raw.toLowerCase()] ||
    (/^[0-9A-Z]{6}$/i.test(raw) ? raw.toUpperCase() : null);
  if (!code) {
    $("message").textContent =
      matches.length > 1
        ? "동일 이름 종목이 여러 개입니다. 종목코드 6자리를 입력해 주세요."
        : "종목 목록에서 찾지 못했습니다. 종목코드를 입력해 주세요.";
    return;
  }
  let label = item?.name || catalog.find((x) => x.code === code)?.name || raw;
  $("run").disabled = true;
  $("message").textContent = "시세를 조회하고 있습니다…";
  $("results").classList.remove("visible");
  try {
    const res = await fetch("/api/prices?code=" + encodeURIComponent(code));
    const data = await res.json();
    if (!res.ok || data.error) throw Error(data.error || "시세 조회 실패");
    if (label === code) {
      try {
        const nr = await fetch("/api/symbols?code=" + encodeURIComponent(code));
        if (nr.ok) {
          const nd = await nr.json();
          if (nd.name) label = nd.name;
        }
      } catch (e) {}
    }
    render(data, code, label);
    loadFlow(code);
    startNaverQuote(code);
    loadMarkets(data);
    $("message").textContent =
      "분석 완료 · " +
      data.source +
      " · " +
      data.dates.at(-1) +
      " 기준 종가 (실시간 시세 아님)";
  } catch (err) {
    $("message").textContent =
      "시세 연결 실패: " +
      err.message +
      " 가격이나 매매 신호를 임의로 표시하지 않습니다.";
  } finally {
    $("run").disabled = false;
  }
};
let currentStock = null,
  marketPeriod = "day";
function marketGroup(s, mode) {
  if (mode === "day") return s;
  const map = new Map();
  for (let i = 0; i < s.dates.length; i++) {
    const dt = s.dates[i],
      d = new Date(dt + "T12:00:00Z");
    let key;
    if (mode === "month") key = dt.slice(0, 7);
    else {
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    map.set(key, { date: dt, price: s.prices[i] });
  }
  return {
    ...s,
    dates: [...map.keys()],
    prices: [...map.values()].map((x) => x.price),
  };
}
document.querySelectorAll("#marketPeriods button").forEach((b) =>
  b.addEventListener("click", () => {
    marketPeriod = b.dataset.marketPeriod;
    document.querySelectorAll("#marketPeriods button").forEach((x) => {
      x.setAttribute("aria-pressed", String(x === b));
      x.style.background = x === b ? "#245aa5" : "";
    });
    loadMarkets();
  }),
);
async function loadMarkets(stock) {
  if (stock) currentStock = stock;
  if (!currentStock) return;
  const status = $("marketStatus");
  status.textContent = "나스닥·코스피·코스닥 지수 조회 중…";
  if (marketPeriod === "minute") {
    status.textContent =
      "분봉 비교 미지원: 미국 나스닥과 한국 증시는 거래 시간이 달라 동일 시각 4개 지수 비교가 불가능합니다. 국내 지수 분봉 공식 공급처도 아직 연결되지 않았습니다.";
    $("marketChart").replaceChildren();
    $("marketCorrelation").textContent =
      "분봉 상관계수 계산 중단 · 서로 다른 거래시간 데이터를 임의로 맞추지 않습니다.";
    return;
  }
  try {
    const res = await fetch("/api/markets?range=1mo&t=" + Date.now());
    const d = await res.json();
    if (!res.ok || !d.series) throw Error(d.error || "시장 데이터 조회 실패");
    const series = [
      {
        name: "분석 종목",
        dates: currentStock.dates,
        prices: currentStock.prices,
        color: "#66b2ff",
      },
      ...d.series.map((x, i) => ({
        ...x,
        color: ["#f7c76c", "#82dbb5", "#db9bf4"][i],
      })),
    ];
    const valid = series
      .filter((x) => x.prices?.length >= 5)
      .map((x) => marketGroup(x, marketPeriod));
    if (valid.length < 2) throw Error("비교 가능한 시장 지수가 없습니다");
    const dateSets = valid.map((x) => new Set(x.dates));
    const dates = valid[0].dates
      .filter((date) => dateSets.every((s) => s.has(date)))
      .slice(
        marketPeriod === "day" ? -23 : marketPeriod === "week" ? -16 : -12,
      );
    if (dates.length < 2) throw Error("공통 기간 데이터가 부족합니다");
    const normalized = valid.map((x) => {
      const map = new Map(x.dates.map((dt, i) => [dt, x.prices[i]]));
      const p = dates.map((dt) => map.get(dt));
      return {
        ...x,
        values: p.map((v) => (v / p[0]) * 100),
        returns: p.slice(1).map((v, i) => v / p[i] - 1),
      };
    });
    const svg = $("marketChart");
    svg.replaceChildren();
    const ns = "http://www.w3.org/2000/svg";
    const all = normalized.flatMap((x) => x.values),
      lo = Math.min(...all) - 1,
      hi = Math.max(...all) + 1;
    for (const x of normalized) {
      const el = document.createElementNS(ns, "polyline");
      el.setAttribute(
        "points",
        x.values
          .map(
            (v, i) =>
              (30 + (i / (dates.length - 1)) * 540).toFixed(1) +
              "," +
              (210 - ((v - lo) / (hi - lo)) * 175).toFixed(1),
          )
          .join(" "),
      );
      el.setAttribute("stroke", x.color);
      el.setAttribute("stroke-width", "2.5");
      el.setAttribute("fill", "none");
      svg.append(el);
    }
    for (let i = 0; i < 5; i++) {
      const idx = Math.round((i * (dates.length - 1)) / 4),
        tx = document.createElementNS(ns, "text");
      tx.setAttribute("x", 30 + (idx / (dates.length - 1)) * 540);
      tx.setAttribute("y", 243);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("fill", "#b9c8de");
      tx.setAttribute("font-size", "12");
      tx.textContent = dates[idx].slice(5).replace("-", "/");
      svg.append(tx);
    }
    $("marketLegend").replaceChildren();
    $("marketLegend").style.cssText =
      "display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px";
    for (const x of normalized) {
      const item = document.createElement("span");
      item.style.cssText =
        "display:inline-flex;align-items:center;gap:7px;font-size:14px;color:#e5edff";
      const swatch = document.createElement("span");
      swatch.style.cssText =
        "display:inline-block;width:25px;height:4px;border-radius:3px;background:" +
        x.color;
      const name = document.createElement("span");
      name.textContent = x.name;
      item.append(swatch, name);
      $("marketLegend").append(item);
    }
    function corr(a, b) {
      const n = a.length,
        am = a.reduce((s, v) => s + v, 0) / n,
        bm = b.reduce((s, v) => s + v, 0) / n;
      let xy = 0,
        aa = 0,
        bb = 0;
      for (let i = 0; i < n; i++) {
        xy += (a[i] - am) * (b[i] - bm);
        aa += (a[i] - am) ** 2;
        bb += (b[i] - bm) ** 2;
      }
      return aa && bb ? xy / Math.sqrt(aa * bb) : null;
    }
    const base = normalized[0].returns;
    {
      const container = $("marketCorrelation");
      container.replaceChildren();
      container.style.cssText =
        "margin-top:12px;padding:13px;border-radius:14px;background:#152139";
      const heading = document.createElement("div");
      heading.style.cssText =
        "font-size:15px;font-weight:800;margin-bottom:11px;color:#e9f1ff";
      heading.textContent = "내 종목과 시장 지수의 움직임 비교";
      container.append(heading);
      const scores = normalized
        .slice(1)
        .map((x) => ({ ...x, correlation: corr(base, x.returns) }));
      const available = scores.filter((x) => x.correlation !== null);
      const highest = available.length
        ? available.reduce((a, b) =>
            Math.abs(a.correlation) >= Math.abs(b.correlation) ? a : b,
          )
        : null;
      const cards = document.createElement("div");
      cards.style.cssText =
        "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px";
      for (const x of scores) {
        const c = x.correlation,
          abs = c === null ? null : Math.abs(c),
          strength =
            abs === null
              ? "계산 불가"
              : abs >= 0.7
                ? "강함"
                : abs >= 0.4
                  ? "보통"
                  : "약함",
          direction =
            c === null ? "자료 부족" : c >= 0 ? "같은 방향" : "반대 방향",
          best = highest === x,
          card = document.createElement("div");
        card.style.cssText =
          "border:1px solid " +
          (best ? x.color : "#394860") +
          ";background:" +
          (best ? "#21334c" : "#101b2c") +
          ";padding:11px 8px;border-radius:12px;min-width:0;text-align:center";
        const label = document.createElement("div");
        label.style.cssText =
          "font-size:12px;color:" + x.color + ";font-weight:800";
        label.textContent = x.name;
        const score = document.createElement("div");
        score.style.cssText =
          "font-size:clamp(19px,3.6vw,28px);font-weight:850;color:#f0f5ff;margin:7px 0";
        score.textContent = c === null ? "—" : c.toFixed(2);
        const strengthEl = document.createElement("div");
        strengthEl.style.cssText =
          "font-size:14px;font-weight:800;color:" +
          (abs >= 0.7 ? "#56dcac" : "#c8d5e9");
        strengthEl.textContent = strength;
        const directionEl = document.createElement("div");
        directionEl.style.cssText =
          "font-size:11px;color:#a8bad4;margin-top:5px";
        directionEl.textContent = direction;
        card.append(label, score, strengthEl, directionEl);
        if (best) {
          const flag = document.createElement("div");
          flag.style.cssText = "font-size:10px;color:#f8d47b;margin-top:7px";
          flag.textContent = "가장 높은 연관성";
          card.append(flag);
        }
        cards.append(card);
      }
      container.append(cards);
      const foot = document.createElement("div");
      foot.style.cssText =
        "font-size:12px;color:#b0c1dc;line-height:1.6;margin-top:11px";
      foot.textContent =
        "표본 " +
        base.length +
        "개 기간 · 선택 기간 수익률 상관관계 · +1에 가까울수록 같은 방향, -1에 가까울수록 반대 방향 · 매수·매도 신호는 아닙니다.";
      container.append(foot);
    }
    status.textContent =
      { day: "일봉", week: "주봉", month: "월봉" }[marketPeriod] +
      " · 지수 데이터 기준 " +
      dates.at(-1) +
      " · 출처: " +
      d.source +
      " · 조회 " +
      new Date().toLocaleTimeString("ko-KR") +
      " · 지연 데이터";
  } catch (e) {
    status.textContent = "시장 지수 연결 실패: " + e.message;
    $("marketChart").replaceChildren();
    $("marketCorrelation").textContent =
      "시장 지수 데이터가 없어 상관관계를 계산하지 않았습니다.";
  }
}
$("marketRefresh").addEventListener("click", () => loadMarkets());
setInterval(() => {
  if (currentStock && !document.hidden) loadMarkets();
}, 300000);
let naverCode = "",
  naverTimer = null,
  naverLast = null;
async function refreshNaver() {
  if (!naverCode || document.hidden) return;
  const code = naverCode;
  try {
    const r = await fetch("/api/naver-quote?code=" + encodeURIComponent(code), {
        cache: "no-store",
      }),
      d = await r.json();
    if (code !== naverCode) return;
    if (!r.ok || !Number.isFinite(d.price)) {
      naverLast = null;
      $("kisState").textContent =
        "시세 확인 실패 · 기존 데이터로 매매 판단 금지: " +
        (d.error || "응답 오류");
      $("kisPrice").textContent = "—";
      $("kisMeta").textContent = "실시간 데이터 검증 불가";
      return;
    }
    naverLast = d;
    $("kisState").textContent =
      "네이버 금융 자동 조회 · " +
      new Date().toLocaleTimeString("ko-KR") +
      " · 공식 실시간 보장 없음";
    $("kisPrice").textContent = Number(d.price).toLocaleString("ko-KR") + "원";
    $("kisMeta").textContent =
      "전일 대비 " +
      Number(d.change).toLocaleString("ko-KR") +
      "원 (" +
      d.rate +
      "%) · 거래량 " +
      Number(d.volume).toLocaleString("ko-KR") +
      "주 · 원본 시각 " +
      (d.sourceTime || "미제공") +
      " · 30초 조회 · 과거 분석과 별개";
  } catch (e) {
    if (code !== naverCode) return;
    naverLast = null;
    $("kisState").textContent =
      "네이버 조회 오류 · 매매 신호 판단 중단: " + e.message;
    $("kisPrice").textContent = "—";
  }
}
function startNaverQuote(code) {
  naverCode = code;
  if (naverTimer) clearInterval(naverTimer);
  refreshNaver();
  naverTimer = setInterval(refreshNaver, 30000);
}
let selectedTimeframe = "day",
  selectedMinute = 5,
  historyIndex = null;
const groupedClose = (dates, prices, mode) =>
  marketGroup({ dates, prices }, mode);
const aggregateBars = (bars, mode) => SignalAnalysis.aggregate(bars, mode);
const aggregateMinutes = (bars, n) =>
  SignalAnalysis.aggregate(bars, "minute", n);
function timeframeTitle() {
  return selectedTimeframe === "minute"
    ? selectedMinute + "분봉"
    : { day: "일봉", week: "주봉", month: "월봉" }[selectedTimeframe];
}
function updateTimeframeJudgment(bars) {
  renderAnalysis(SignalAnalysis.analyze(bars));
}
function updateHistoricConclusion(bars) {
  renderAnalysis(SignalAnalysis.analyze(bars));
}
function historyVerdict(bars) {
  return SignalAnalysis.analyze(bars).label;
}
function renderAnalysis(v) {
  const title = timeframeTitle(),
    date = v.date,
    missing = v.status === "insufficient";
  const text = (id, value) => ($(id).textContent = value);
  for (const id of ["verdict", "beginnerDecision"]) {
    text(id, v.label);
    $(id).style.color = v.color;
  }
  $("verdict").style.background = v.color + "22";
  $("verdict").style.border = "1px solid " + v.color;
  $("beginnerSignal").firstElementChild.textContent =
    "초보자를 위한 기술적 판단 · " + title + " 기준";
  text(
    "analysisTopDate",
    "📅 " + (historyIndex === null ? "최신" : "과거") + " 분석 기준 · " + date,
  );
  text("asof", "선택 분석 기준: " + date + " · " + title + " · 완료된 봉 기준");
  $("kisMeta").textContent =
    "현재 조회 시세는 과거 분석과 별개 · 공식 실시간 보장 없음";
  text("price", v.price === null ? "—" : money(v.price));
  text("entry", missing ? "—" : money(v.low) + " ~ " + money(v.high));
  text("exit", missing ? "—" : money(v.target) + " / " + money(v.stop));
  $("entry").style.color = v.color;
  text(
    "rationale",
    missing
      ? "60개 이상의 완료된 봉과 유효한 OHLC 데이터가 필요합니다."
      : "매수 관심 구간은 직전 20봉 기준이며, 20·60봉 이동평균·MACD·RSI 조건을 함께 확인합니다. 자동 주문은 실행하지 않습니다.",
  );
  text(
    "indicators",
    missing
      ? title + " · " + v.count + "개 봉 · 데이터 부족"
      : title +
          " · 20봉 평균 " +
          money(v.ma20) +
          " · 60봉 평균 " +
          money(v.ma60) +
          " · MACD " +
          v.macd.toFixed(2) +
          " / 신호 " +
          v.signal.toFixed(2) +
          " · RSI(14) " +
          v.rsi.toFixed(2) +
          " · " +
          date,
  );
  const reasons = $("beginnerReasons"),
    c = $("conclusion");
  reasons.replaceChildren();
  c.replaceChildren();
  function add(parent, tag, value) {
    const e = document.createElement(tag);
    e.textContent = value;
    parent.append(e);
    return e;
  }
  add(c, "div", "📅 " + date + " · " + title);
  const heading = add(c, "h3", v.label);
  heading.style.color = v.color;
  c.style.border = "1px solid " + v.color;
  add(c, "p", "선택 시점 종가 " + (v.price === null ? "—" : money(v.price)));
  if (missing) {
    add(
      c,
      "p",
      "완료된 봉 " +
        v.count +
        "개 · 최소 60개 필요. 매수 구간과 목표·위험 판단을 보류합니다.",
    );
    return;
  }
  for (const [key, label, detail] of [
    ["zone", "매수 관심 구간", money(v.low) + " ~ " + money(v.high)],
    ["ma", "20·60봉 이동평균", "종가 ≥ 20·60봉선 · 20봉선 상승"],
    ["macd", "MACD(12,26,9)", "MACD > 신호선 · 직전 봉보다 상승"],
    ["rsi", "RSI(14)", "50 이상 · 70 미만 (Wilder 방식)"],
  ]) {
    const row = add(reasons, "div", (v.checks[key] ? "✓ " : "✕ ") + label);
    row.style.cssText =
      "padding:10px 6px;background:#0e1b2e;border-radius:9px;font-size:12px;overflow-wrap:anywhere";
    row.style.color = v.checks[key] ? "#48dca8" : "#ffb6a5";
    add(c, "p", (v.checks[key] ? "✓ " : "✕ ") + label + " · " + detail);
  }
  add(
    c,
    "p",
    "상승 관찰 목표 " + money(v.target) + " / 위험 경계 " + money(v.stop),
  );
  add(
    c,
    "p",
    "적정 매수 판단가 · 기술적 참고값 " + money((v.low + v.high) / 2),
  );
  add(
    c,
    "small",
    "관심 구간 중간값은 적정가치가 아닙니다. 선택 시점까지의 완료된 봉만 사용 · 수급·뉴스 미반영 · 참고 판단 · 자동 주문 없음",
  );
}
function historySetup(full) {
  const max = full.length - 1,
    slider = $("historySlider");
  slider.max = max;
  slider.min = 0;
  if (historyIndex !== null)
    historyIndex = Math.max(0, Math.min(max, historyIndex));
  const i = historyIndex === null ? max : historyIndex;
  slider.value = i;
  const top = $("analysisTopDate");
  if (top)
    top.textContent =
      "📅 " +
      (historyIndex === null ? "최신 분석" : "과거 분석") +
      " 기준 · " +
      full[i].date;
  $("historyDate").textContent =
    (historyIndex === null ? "최신" : "과거") +
    " · " +
    full[i].date +
    " · 종가 " +
    Math.round(full[i].close).toLocaleString("ko-KR") +
    "원";
  $("historyComparison").textContent =
    "선택 시점 판단: " + historyVerdict(full.slice(0, i + 1));
}
$("historySlider").addEventListener("input", (e) => {
  historyIndex = Number(e.target.value);
  drawTimeframe();
});
$("historyLatest").addEventListener("click", () => {
  historyIndex = null;
  drawTimeframe();
});
function drawTimeframe() {
  document.querySelectorAll("#timeframeTabs button").forEach((b) => {
    const active = b.dataset.tf
      ? b.dataset.tf === selectedTimeframe
      : selectedTimeframe === "minute" &&
        Number(b.dataset.min) === selectedMinute;
    b.setAttribute("aria-pressed", String(active));
    b.style.background = active ? "#245aa5" : "";
  });
  const d = window.signalDaily;
  if (!d) return;
  const info = $("timeframeInfo"),
    svg = $("priceChart"),
    vol = $("volumeChart"),
    mac = $("macdChart");
  svg.replaceChildren();
  vol.replaceChildren();
  mac.replaceChildren();
  if (
    (selectedTimeframe === "minute" && !window.signalMinute?.candles?.length) ||
    !d.candles?.length
  ) {
    renderAnalysis(SignalAnalysis.analyze([]));
    $("historyPanel").style.display = "none";
    info.textContent = "OHLC 데이터 미수신 · 판단 보류";
    if (selectedTimeframe !== "minute") {
      const pairs = d.dates
        .map((date, i) => ({ date, price: d.prices[i] }))
        .filter(
          (x) =>
            /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
            Number.isFinite(x.price) &&
            x.price > 0 &&
            Date.parse(x.date + "T15:30:00+09:00") <= Date.now(),
        );
      const series = {
        dates: pairs.map((x) => x.date),
        prices: pairs.map((x) => x.price),
      };
      const v =
        selectedTimeframe === "day"
          ? series
          : groupedClose(series.dates, series.prices, selectedTimeframe);
      if (v.prices.length >= 2) {
        svg.setAttribute("viewBox", "0 0 600 260");
        chart(v.prices, v.dates);
        info.textContent += " · 종가 선차트만 표시 (매수 판단 보류)";
      }
    }
    $("signalCount").textContent = "유효한 원본 데이터 수신 대기";
    return;
  }
  svg.setAttribute("viewBox", "0 0 900 480");
  let bars =
    selectedTimeframe === "minute"
      ? aggregateMinutes(window.signalMinute.candles, selectedMinute)
      : selectedTimeframe === "day"
        ? SignalAnalysis.aggregate(d.candles, "day")
        : aggregateBars(d.candles, selectedTimeframe);
  const fullBars = bars;
  if (!fullBars.length) {
    renderAnalysis(SignalAnalysis.analyze([]));
    $("historyPanel").style.display = "none";
    info.textContent = "완료된 봉 없음";
    $("signalCount").textContent = "데이터 대기";
    return;
  }
  $("historyPanel").style.display = "block";
  historySetup(fullBars);
  const cut = historyIndex === null ? fullBars.length : historyIndex + 1;
  bars = fullBars.slice(0, cut).slice(-110);
  updateHistoricConclusion(fullBars.slice(0, cut));
  const ns = "http://www.w3.org/2000/svg",
    create = (parent, tag, attrs, content) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (content !== undefined) e.textContent = content;
      parent.append(e);
      return e;
    },
    left = 45,
    right = 875,
    width = right - left,
    lo = Math.min(...bars.map((b) => b.low)) * 0.98,
    hi = Math.max(...bars.map((b) => b.high)) * 1.02,
    y = (v) => 435 - ((v - lo) / (hi - lo || 1)) * 405,
    x = (i) => left + ((i + 0.5) * width) / bars.length,
    bw = Math.max(2, Math.min(12, (width / bars.length) * 0.65)),
    closes = bars.map((b) => b.close);
  for (let i = 0; i < 5; i++) {
    const v = lo + ((hi - lo) * i) / 4,
      yy = y(v);
    create(svg, "line", {
      x1: left,
      y1: yy,
      x2: right,
      y2: yy,
      stroke: "#35445e",
      "stroke-width": 0.7,
    });
    create(
      svg,
      "text",
      { x: 3, y: yy + 4, fill: "#a8b9d1", "font-size": 12 },
      Math.round(v).toLocaleString("ko-KR"),
    );
  }
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i],
      cx = x(i),
      up = b.close >= b.open,
      c = up ? "#ff5362" : "#4a91ff";
    create(svg, "line", {
      x1: cx,
      x2: cx,
      y1: y(b.high),
      y2: y(b.low),
      stroke: c,
      "stroke-width": 1.5,
    });
    create(svg, "rect", {
      x: cx - bw / 2,
      y: Math.min(y(b.open), y(b.close)),
      width: bw,
      height: Math.max(1, Math.abs(y(b.open) - y(b.close))),
      fill: c,
    });
    const tip = create(
      svg,
      "title",
      {},
      b.date +
        " 시 " +
        b.open +
        " 고 " +
        b.high +
        " 저 " +
        b.low +
        " 종 " +
        b.close +
        " 거래량 " +
        b.volume,
    );
    const maxv = Math.max(...bars.map((q) => q.volume), 1),
      vh = (92 * b.volume) / maxv;
    create(vol, "rect", {
      x: cx - bw / 2,
      y: 105 - vh,
      width: bw,
      height: vh,
      fill: c,
    });
    if (i % Math.max(1, Math.round(bars.length / 6)) === 0)
      create(
        svg,
        "text",
        {
          x: cx,
          y: 464,
          fill: "#b7c5d9",
          "font-size": 12,
          "text-anchor": "middle",
        },
        b.date.slice(5).replace("-", "/"),
      );
  }
  for (const [n, c] of [
    [5, "#55d18c"],
    [20, "#5c9fff"],
    [60, "#bb7ae9"],
    [120, "#ffad62"],
  ]) {
    let pts = [];
    for (let i = 0; i < bars.length; i++) {
      const all = fullBars.slice(0, cut).map((b) => b.close);
      const pos = i + (all.length - bars.length);
      if (pos >= n - 1) {
        const v =
          all.slice(pos - n + 1, pos + 1).reduce((a, b) => a + b, 0) / n;
        pts.push(x(i) + "," + y(v));
      }
    }
    if (pts.length > 1)
      create(svg, "polyline", {
        points: pts.join(" "),
        fill: "none",
        stroke: c,
        "stroke-width": 1.7,
      });
  }
  const fullMac = SignalAnalysis.macd(
      fullBars.slice(0, cut).map((b) => b.close),
    ),
    diff = fullMac.line.slice(-bars.length),
    sig = fullMac.signal.slice(-bars.length),
    hist = fullMac.histogram.slice(-bars.length),
    bound = Math.max(...diff.map(Math.abs), ...sig.map(Math.abs), 1),
    my = (v) => 65 - (v / bound) * 53;
  create(mac, "line", {
    x1: left,
    x2: right,
    y1: 65,
    y2: 65,
    stroke: "#63718b",
  });
  for (let i = 0; i < bars.length; i++) {
    const v = hist[i];
    create(mac, "rect", {
      x: x(i) - bw / 2,
      y: Math.min(65, my(v)),
      width: bw,
      height: Math.max(1, Math.abs(my(v) - 65)),
      fill: v >= 0 ? "#ff7e87" : "#71a7ff",
    });
  }
  for (const [arr, c] of [
    [diff, "#e6e9ef"],
    [sig, "#ff9e4a"],
  ])
    create(mac, "polyline", {
      points: arr.map((v, i) => x(i) + "," + my(v)).join(" "),
      fill: "none",
      stroke: c,
      "stroke-width": 1.6,
    });
  let buyCount = 0,
    sellCount = 0;
  for (let i = 1; i < bars.length; i++) {
    if (cut - bars.length + i < 34) continue;
    const buy = diff[i - 1] <= sig[i - 1] && diff[i] > sig[i],
      sell = diff[i - 1] >= sig[i - 1] && diff[i] < sig[i];
    if (!buy && !sell) continue;
    const yy = Math.max(13, Math.min(122, my(diff[i]) + (buy ? 17 : -12))),
      col = buy ? "#41e7a3" : "#ff5b6b";
    const arrow = create(
      mac,
      "text",
      {
        x: x(i),
        y: yy,
        fill: col,
        "font-size": 17,
        "font-weight": "bold",
        "text-anchor": "middle",
      },
      buy ? "▲" : "▼",
    );
    create(
      arrow,
      "title",
      {},
      bars[i].date +
        " · MACD " +
        (buy ? "상향 돌파 · 매수 관찰" : "하향 돌파 · 매도 관찰") +
        " · 종가 " +
        bars[i].close,
    );
    if (buy) buyCount++;
    else sellCount++;
  }
  info.textContent =
    (selectedTimeframe === "minute"
      ? selectedMinute + "분봉"
      : { day: "일봉", week: "주봉", month: "월봉" }[selectedTimeframe]) +
    " · " +
    bars.length +
    "개 봉 · " +
    bars.at(-1).date +
    " 기준 · " +
    (selectedTimeframe === "minute"
      ? "최근 약 1개월 5분봉 원본 집계 (실시간 보장 안 됨)"
      : "네이버 일별 OHLC 데이터 (실시간 아님)");
  $("signalCount").textContent =
    "빨강 상승 · 파랑 하락 · 이동평균 5(초록) 20(파랑) 60(보라) 120(주황) · 거래량 · MACD · ▲ 매수 관찰 " +
    buyCount +
    "회 · ▼ 매도 관찰 " +
    sellCount +
    "회 (MACD 교차, 확정 신호 아님)";
}
document.querySelectorAll("#timeframeTabs button[data-tf]").forEach((b) =>
  b.addEventListener("click", () => {
    selectedTimeframe = b.dataset.tf;
    historyIndex = null;
    document.querySelectorAll("#timeframeTabs button").forEach((x) => {
      x.setAttribute("aria-pressed", String(x === b));
      x.style.background = x === b ? "#245aa5" : "";
    });
    drawTimeframe();
    if (selectedTimeframe === "minute") loadMinute();
  }),
);
document.querySelectorAll("#minuteChoices button").forEach((b) =>
  b.addEventListener("click", () => {
    selectedMinute = Number(b.dataset.min);
    selectedTimeframe = "minute";
    historyIndex = null;
    document.querySelectorAll("#minuteChoices button").forEach((x) => {
      x.setAttribute("aria-pressed", String(x === b));
      x.style.background = x === b ? "#245aa5" : "";
    });
    drawTimeframe();
    loadMinute();
  }),
);
let minuteTimer = null,
  minuteRequestId = 0;
async function loadMinute() {
  const d = window.signalDaily;
  if (!d?.code || selectedTimeframe !== "minute") return;
  const code = d.code,
    requestId = ++minuteRequestId;
  try {
    const r = await fetch(
        "/api/minutes?code=" + encodeURIComponent(code) + "&t=" + Date.now(),
        { cache: "no-store" },
      ),
      v = await r.json();
    if (
      requestId !== minuteRequestId ||
      code !== window.signalDaily?.code ||
      selectedTimeframe !== "minute"
    )
      return;
    if (!r.ok || !v.candles?.length) {
      window.signalMinute = null;
      drawTimeframe();
      $("timeframeInfo").textContent =
        "분봉 수신 실패: " + (v.error || "데이터 없음");
      return;
    }
    window.signalMinute = v;
    drawTimeframe();
  } catch (e) {
    if (
      requestId !== minuteRequestId ||
      code !== window.signalDaily?.code ||
      selectedTimeframe !== "minute"
    )
      return;
    window.signalMinute = null;
    drawTimeframe();
    $("timeframeInfo").textContent = "분봉 수신 실패: " + e.message;
  }
}
minuteTimer = setInterval(() => {
  if (!document.hidden && selectedTimeframe === "minute") loadMinute();
}, 30000);
let flowCode = "",
  flowRows = [],
  flowPeriod = "day";
document.querySelectorAll("#flowPeriod button").forEach((b) =>
  b.addEventListener("click", () => {
    flowPeriod = b.dataset.flow;
    drawFlow();
  }),
);
async function loadFlow(code) {
  flowCode = code;
  const flowLink = document.getElementById("naverFlowLink");
  if (flowLink)
    flowLink.href =
      "https://finance.naver.com/item/frgn.naver?code=" +
      encodeURIComponent(code);
  $("flowStatus").textContent = "네이버 증권 수급 조회 중";
  try {
    const r = await fetch("/api/flow?code=" + encodeURIComponent(code), {
        cache: "no-store",
      }),
      d = await r.json();
    if (code !== flowCode) return;
    if (!r.ok || !d.rows?.length) throw Error(d.error || "자료 없음");
    flowRows = d.rows;
    window.flowMeta = d;
    drawFlow();
  } catch (e) {
    if (code !== flowCode) return;
    flowRows = [];
    $("flowInvestorCards").replaceChildren();
    $("flowSvg").replaceChildren();
    $("flowStatus").textContent = "수급 데이터 연결 실패: " + e.message;
    $("flowLegend").textContent = "데이터를 임의로 생성하지 않습니다.";
  }
}
function drawFlow() {
  const svg = $("flowSvg");
  svg.replaceChildren();
  document.querySelectorAll("#flowPeriod button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.flow === flowPeriod));
    b.style.background = b.dataset.flow === flowPeriod ? "#245aa5" : "";
  });
  if (!flowRows.length) return;
  const groups = new Map();
  for (const row of flowRows) {
    const date = new Date(row.date + "T12:00:00Z");
    let key = row.date;
    if (flowPeriod === "week") {
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      key = date.toISOString().slice(0, 10);
    }
    if (flowPeriod === "month") key = row.date.slice(0, 7);
    const old = groups.get(key) || {
      key,
      foreign: 0,
      institution: 0,
      personal: 0,
    };
    old.foreign += row.foreign;
    old.institution += row.institution;
    old.personal += row.personal;
    groups.set(key, old);
  }
  const rows = [...groups.values()].slice(
      flowPeriod === "day" ? -65 : flowPeriod === "week" ? -14 : -4,
    ),
    ns = "http://www.w3.org/2000/svg",
    max = Math.max(
      1,
      ...rows.flatMap((r) => [
        Math.abs(r.foreign),
        Math.abs(r.institution),
        Math.abs(r.personal),
      ]),
    ),
    zero = 125,
    scale = 95 / max;
  function el(tag, attrs, content) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (content !== undefined) e.textContent = content;
    svg.append(e);
    return e;
  }
  el("line", { x1: 30, x2: 605, y1: zero, y2: zero, stroke: "#8493ac" });
  rows.forEach((r, i) => {
    const cx = 35 + ((i + 0.5) * 560) / rows.length,
      w = Math.min(13, 210 / rows.length);
    for (const [j, key, color] of [
      [-1, "foreign", "#ff6b42"],
      [0, "institution", "#ffba35"],
      [1, "personal", "#b657f5"],
    ]) {
      const v = r[key],
        height = Math.abs(v) * scale;
      el("rect", {
        x: cx + j * w,
        y: v >= 0 ? zero - height : zero,
        width: w - 1,
        height: Math.max(1, height),
        fill: color,
      });
    }
    if (i % Math.max(1, Math.ceil(rows.length / 6)) === 0)
      el(
        "text",
        {
          x: cx,
          y: 246,
          fill: "#a9bcd9",
          "font-size": 12,
          "text-anchor": "middle",
        },
        r.key.slice(5),
      );
  });
  $("flowStatus").textContent =
    { day: "일일", week: "주간", month: "월간" }[flowPeriod] +
    " 순매매량(주) · " +
    rows.length +
    "개 기간 · 원본 기준 " +
    flowRows.at(-1).date +
    " · 지연 가능 · " +
    (window.flowMeta?.completeMonth
      ? "최근 3개월 수급 데이터 확보"
      : "월간/주간 합계는 일부 기간일 수 있음");
  {
    const cards = $("flowInvestorCards");
    cards.replaceChildren();
    const latest = rows.at(-1);
    for (const [key, name, color] of [
      ["foreign", "외국인", "#ff6b42"],
      ["institution", "기관", "#ffba35"],
      ["personal", "개인", "#b657f5"],
    ]) {
      const card = document.createElement("div");
      card.style.cssText =
        "min-width:0;border:2px solid " +
        color +
        ";border-radius:12px;padding:10px 6px;text-align:center;background:#111e33";
      const heading = document.createElement("div");
      heading.style.cssText =
        "display:flex;align-items:center;justify-content:center;gap:6px;color:" +
        color +
        ";font-weight:850;font-size:15px";
      const dot = document.createElement("span");
      dot.style.cssText =
        "width:11px;height:11px;flex-shrink:0;border-radius:3px;background:" +
        color;
      const nameEl = document.createElement("span");
      nameEl.textContent = name;
      heading.append(dot, nameEl);
      const amount = document.createElement("div");
      amount.style.cssText =
        "font-size:clamp(13px,2.6vw,19px);font-weight:850;margin:8px 0 4px;overflow-wrap:anywhere;color:#f2f6ff";
      const v = latest[key];
      amount.textContent =
        (v > 0 ? "+" : "") + v.toLocaleString("ko-KR") + "주";
      const side = document.createElement("div");
      side.style.cssText =
        "font-size:12px;font-weight:750;color:" +
        (v >= 0 ? "#58d7ac" : "#ff9a9a");
      side.textContent = v > 0 ? "▲ 순매수" : v < 0 ? "▼ 순매도" : "— 중립";
      card.append(heading, amount, side);
      cards.append(card);
    }
    $("flowLegend").textContent =
      "색상은 위 카드와 동일 · 기준선 위 = 순매수 / 아래 = 순매도 · 카드 수치는 가장 최근 " +
      { day: "거래일", week: "주간", month: "월간" }[flowPeriod] +
      " 합계";
  }
  $("flowPersonal").textContent =
    "개인 순매매량 포함 · 네이버 증권 KRX 일별 순매수량(주) · 장중 실시간 수급 아님";
}
(function () {
  const list = document.getElementById("breakingList"),
    status = document.getElementById("breakingStatus"),
    button = document.getElementById("breakingNotify");
  let seen = new Set(),
    started = false,
    busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch("/api/breaking-news?t=" + Date.now()),
        d = await r.json();
      if (!r.ok || !Array.isArray(d.items)) throw Error(d.error || "조회 오류");
      list.replaceChildren();
      for (const x of d.items) {
        if (!/^https:\/\//i.test(x.url)) continue;
        const a = document.createElement("a");
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.cssText =
          "display:block;padding:12px;border-radius:10px;background:#192841;border:1px solid " +
          (x.level === "긴급 후보" ? "#f9a078" : "#405778") +
          ";color:#eaf1ff;text-decoration:none";
        const m = document.createElement("div");
        m.style.cssText = "font-size:12px;color:#a8c6ec;margin-bottom:6px";
        m.textContent =
          x.level +
          " · " +
          x.market +
          " · " +
          new Date(x.published).toLocaleString("ko-KR");
        const t = document.createElement("div");
        t.style.cssText = "font-weight:750;line-height:1.5";
        t.textContent = x.title;
        const s = document.createElement("div");
        s.style.cssText = "font-size:12px;color:#a8bad5;margin-top:5px";
        s.textContent = x.source + " · 기사 보기 ↗";
        a.append(m, t, s);
        list.append(a);
      }
      if (!d.items.length)
        list.textContent = "최근 48시간 내 해당 뉴스가 없습니다.";
      if (
        started &&
        button.dataset.enabled === "true" &&
        "Notification" in window &&
        Notification.permission === "granted"
      )
        for (const x of d.items
          .filter((x) => x.level === "긴급 후보" && !seen.has(x.id))
          .slice(0, 3))
          new Notification("SIGNAL 시장 긴급뉴스 후보", {
            body: x.title,
            tag: "signal-" + x.id,
          });
      d.items.forEach((x) => seen.add(x.id));
      started = true;
      status.textContent =
        "최종 확인 " +
        new Date().toLocaleTimeString("ko-KR") +
        " · " +
        d.items.length +
        "건" +
        (d.partial ? " · 일부 출처 조회 실패" : "");
    } catch (e) {
      status.textContent = "뉴스 연결 오류: " + e.message;
    } finally {
      busy = false;
    }
  }
  document.getElementById("breakingRefresh").onclick = load;
  button.onclick = async () => {
    if (!("Notification" in window)) {
      button.textContent = "알림 미지원";
      return;
    }
    if (
      Notification.permission !== "granted" &&
      (await Notification.requestPermission()) !== "granted"
    ) {
      button.textContent = "알림 권한 거부";
      return;
    }
    button.dataset.enabled =
      button.dataset.enabled === "true" ? "false" : "true";
    button.textContent =
      button.dataset.enabled === "true"
        ? "알림 켜짐 · 끄기"
        : "브라우저 알림 켜기";
  };
  load();
  setInterval(() => {
    if (!document.hidden) load();
  }, 300000);
})();

// Keep price, volume and MACD dates aligned while panning on a phone.
document.querySelectorAll(".chart-scroll").forEach((el) =>
  el.addEventListener("scroll", () => {
    for (const other of document.querySelectorAll(".chart-scroll"))
      if (other !== el && other.scrollLeft !== el.scrollLeft)
        other.scrollLeft = el.scrollLeft;
  }),
);
