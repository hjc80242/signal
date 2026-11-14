// Local test server for the existing Vercel handler interface. Never proxies production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = process.cwd();
const routes = new Set([
  "prices",
  "minutes",
  "flow",
  "markets",
  "symbols",
  "naver-quote",
  "breaking-news",
]);
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.status = (n) => {
      res.statusCode = n;
      return res;
    };
    res.json = (data) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname.startsWith("/api/")) {
        const name = url.pathname.slice(5);
        if (!routes.has(name))
          return res.status(404).json({ error: "API 없음" });
        req.query = Object.fromEntries(url.searchParams);
        const { default: handler } = await import("./api/" + name + ".js");
        return await handler(req, res);
      }
      const file = resolve(
        root,
        "." +
          (url.pathname === "/"
            ? "/index.html"
            : decodeURIComponent(url.pathname)),
      );
      if (!file.startsWith(root + "/") || url.pathname.includes("/."))
        return res.status(403).end();
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
        }[extname(file)] || "text/plain; charset=utf-8",
      );
      res.end(await readFile(file));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  })
  .listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(
      "SIGNAL local test server on port " + (process.env.PORT || 4173),
    ),
  );
