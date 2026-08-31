import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';

const fixtureRoot = resolve(import.meta.dirname, '../fixtures');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
]);

function startServer(port, crossOrigin) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    if (crossOrigin && pathname === '/cross-origin.css') {
      response.writeHead(200, {'content-type': 'text/css', 'access-control-allow-origin': '*'});
      response.end('body{border-top:1px solid transparent}');
      return;
    }
    if (pathname === '/failed.css') {
      response.writeHead(503, {'content-type': 'text/css'});
      response.end('unavailable');
      return;
    }
    if (pathname === '/oversized.css') {
      response.writeHead(200, {'content-type': 'text/css', 'content-length': String(8 * 1024 * 1024 + 1)});
      response.end('');
      return;
    }
    const relative = pathname === '/' ? 'static-light/index.html' : pathname.replace(/^\//, '');
    const path = resolve(fixtureRoot, relative);
    if (!path.startsWith(`${fixtureRoot}${sep}`)) {
      response.writeHead(400).end('bad path');
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, {'content-type': mimeTypes.get(extname(path)) ?? 'application/octet-stream'});
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  }).listen(port, '127.0.0.1');
}

startServer(4173, false);
startServer(4174, true);
console.log('Fixture servers: http://127.0.0.1:4173 and http://127.0.0.1:4174');
