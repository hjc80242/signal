const fs = require("node:fs"),
  vm = require("node:vm");
const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(
    require("node:path").join(__dirname, "../analysis.js"),
    "utf8",
  ),
  context,
);
function bars(count = 360, base = 70000) {
  let seed = 42,
    p = base;
  return Array.from({ length: count }, (_, i) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const open = p;
    p = Math.max(base * 0.1, p + (seed / 2 ** 32 - 0.47) * base * 0.04);
    return {
      date: new Date(Date.UTC(2023, 0, 2 + i)).toISOString().slice(0, 10),
      open,
      close: p,
      high: Math.max(p, open) * 1.005,
      low: Math.min(p, open) * 0.995,
      volume: 10000 + i,
    };
  });
}
module.exports = { A: context.SignalAnalysis, bars };
