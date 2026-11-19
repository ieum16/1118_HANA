import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import handler from './api/news.js';

const root = new URL('.', import.meta.url);
const port = Number(process.env.PORT || 4184);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  if (url.pathname === '/api/news') return handler(req, res);
  if (req.method !== 'GET' || !['/', '/index.html'].includes(url.pathname)) { res.statusCode = 404; return res.end('Not found'); }
  try {
    const html = await readFile(new URL('index.html', root));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
  } catch { res.statusCode = 500; res.end('Page unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port} (${fileURLToPath(root)})`));
