import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'], '/engine.mjs': ['engine.mjs', 'text/javascript; charset=utf-8'] };
for (const file of ['strategy.mjs','strategy-worker.mjs','bot-controller.mjs','records.mjs']) files['/'+file] = [file,'text/javascript; charset=utf-8'];
for (const name of ['rock','paper','scissors']) files[`/assets/${name}.png`] = [`assets/${name}.png`, 'image/png'];
const port = Number(process.env.PORT || 4318);
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  const file = files[path];
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500); response.end('Unable to load game'); }
}).listen(port, '127.0.0.1', () => console.log(`Intransitive practice: http://127.0.0.1:${port}`));
