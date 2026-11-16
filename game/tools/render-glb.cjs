#!/usr/bin/env node
// Dev tool: render a GLB to a PNG contact sheet and print its stats as JSON.
// usage: node tools/render-glb.cjs <glb path inside game/> <out.png> [w] [h] ["clip=0&phases=4&bones=1"]
// (Run from the game/ directory. Playwright is resolved globally.)
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const [, , glb, out, w = '1024', h = '1024', extra = ''] = process.argv;
if (!glb || !out) { console.error('usage: render-glb.cjs <glb> <out.png> [w h] [query]'); process.exit(2); }
const root = path.resolve(__dirname, '../..');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, async () => {
  const port = server.address().port; let b;
  try {
    b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const p = await b.newPage({ viewport: { width: +w, height: +h } });
    p.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text().slice(0, 300)); });
    const rel = '/' + path.relative(root, path.resolve(glb)).split(path.sep).join('/');
    await p.goto(`http://127.0.0.1:${port}/game/tools/viewer.html?f=${encodeURIComponent(rel)}&w=${w}&h=${h}&${extra}`);
    await p.waitForFunction('window.__stats', null, { timeout: 120000 });
    console.log(JSON.stringify(await p.evaluate('window.__stats')));
    await p.screenshot({ path: out });
  } catch (e) { console.error('ERR', String(e).slice(0, 500)); process.exitCode = 1; }
  finally { if (b) await b.close(); server.close(); }
});
