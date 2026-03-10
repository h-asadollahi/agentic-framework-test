import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "admin/public");
const port = Number(process.env.ADMIN_UI_PORT || 4174);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer((req, res) => {
  const rawPath = (req.url || "/").split("?")[0];
  const requestPath = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = normalize(requestPath).replace(/^\/+/, "");
  const filePath = resolve(join(root, safePath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  const content = readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", mime[extname(filePath)] || "application/octet-stream");
  res.end(content);
});

server.listen(port, () => {
  console.log(`Admin UI running at http://localhost:${port}`);
  console.log("Configure API base + token in the UI to access /admin endpoints.");
});
