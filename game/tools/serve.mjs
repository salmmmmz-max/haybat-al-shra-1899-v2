#!/usr/bin/env node
/**
 * Dev static server.
 *   /            → app/public
 *   /harness/*   → game/harness + game/.cache/harness        (/harness-<tag>/* → game/.cache/harness-<tag>, see build.mjs --tag)
 *   /ws…         → 426 (no room server locally; the client falls back to local saves)
 * usage: node tools/serve.mjs [port]   (port 0 = pick a free one; prints "listening <port>")
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(__dirname, '..');
const PUB = path.resolve(GAME, '../app/public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

export function createServer() {
  return http.createServer((req, res) => {
    let u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u.startsWith('/ws')) { res.writeHead(426); return res.end('no room server in dev'); }
    let file;
    const hm = /^\/(harness(?:-[\w-]+)?)\/(.*)$/.exec(u);
    if (hm) {
      // /harness/…  or  /harness-<tag>/…  (private build of one engineer)
      const rel = hm[2];
      file = [path.join(GAME, 'harness', rel), path.join(GAME, '.cache', hm[1], rel), path.join(PUB, rel)].find(f => f.startsWith(GAME.replace(/game$/, '')) && fs.existsSync(f) && fs.statSync(f).isFile());
    } else {
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(PUB, u);
      if (f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile()) file = f;
    }
    if (!file) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 8080);
  const s = createServer();
  s.listen(port, () => console.log('listening', s.address().port));
}
