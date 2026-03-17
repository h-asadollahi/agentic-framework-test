import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "admin/public");
const port = Number(process.env.ADMIN_UI_PORT || 4174);
const proxyPrefix = "/_admin_proxy";
const configPath = "/admin-ui-config";
const defaultApiBase = normalizeApiBase("http://localhost:3001");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeApiBase(value) {
  const candidate = String(value || "").trim() || "http://localhost:3001";
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Admin UI proxy only supports http/https API base URLs");
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getUiConfig() {
  const adminToken = process.env.ADMIN_API_TOKEN?.trim();
  return {
    defaultApiBase,
    authMode: adminToken ? "env-token" : "allowlist-only",
    authDescription: adminToken
      ? "Server-side ADMIN_API_TOKEN loaded from .env"
      : "No ADMIN_API_TOKEN on the admin server; proxied requests rely on API IP allowlisting.",
  };
}

async function proxyAdminRequest(req, res, requestPath, queryString) {
  if (!requestPath.startsWith("/admin/") && requestPath !== "/admin") {
    sendJson(res, 404, { error: "Admin proxy only supports /admin/* routes" });
    return;
  }

  let apiBase;
  try {
    apiBase = normalizeApiBase(getHeader(req, "x-admin-api-base") || defaultApiBase);
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const targetUrl = `${apiBase}${requestPath}${queryString}`;
  const headers = new Headers();
  const contentType = getHeader(req, "content-type");
  const accept = getHeader(req, "accept");
  const adminToken = process.env.ADMIN_API_TOKEN?.trim();

  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (adminToken) headers.set("authorization", `Bearer ${adminToken}`);

  try {
    const body =
      req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())
        ? await readRequestBody(req)
        : undefined;
    const upstream = await fetch(targetUrl, {
      method: req.method || "GET",
      headers,
      body,
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (
        key === "content-length" ||
        key === "transfer-encoding" ||
        key === "connection"
      ) {
        return;
      }
      res.setHeader(key, value);
    });
    res.end(responseBody);
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : String(error),
      targetUrl,
    });
  }
}

function serveStatic(res, requestPath) {
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
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;

  if (requestPath === configPath) {
    sendJson(res, 200, getUiConfig());
    return;
  }

  if (requestPath.startsWith(proxyPrefix)) {
    const proxiedPath = requestPath.slice(proxyPrefix.length) || "/admin";
    await proxyAdminRequest(req, res, proxiedPath, url.search);
    return;
  }

  serveStatic(res, requestPath);
});

server.listen(port, () => {
  const config = getUiConfig();
  console.log(`Admin UI running at http://localhost:${port}`);
  console.log(`Default API base: ${config.defaultApiBase}`);
  console.log(config.authDescription);
});
