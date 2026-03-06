import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const DEMO_DIR = resolve(process.cwd(), 'demo');
const PORT = Number(process.env.DEMO_PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url || '/index.html';
  const fullPath = join(DEMO_DIR, url);

  if (!fullPath.startsWith(DEMO_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = extname(fullPath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const data = readFileSync(fullPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Demo app running: http://localhost:${PORT}`);
});
