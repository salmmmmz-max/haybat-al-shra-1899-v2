#!/usr/bin/env node
/**
 * Client build — bundles game/src into app/public/{game.js,game.css}, copies fonts.
 *   node tools/build.mjs            production build (minified)
 *   node tools/build.mjs --dev      unminified + inline sourcemap
 *   node tools/build.mjs --harness  also build the dev harness bundle into .cache/harness/
 *   node tools/build.mjs --watch    rebuild on change (dev)
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(__dirname, '..');
const PUB = path.resolve(GAME, '../app/public');
const argv = process.argv.slice(2);
const args = new Set(argv);
/** --tag <name>: private harness build into .cache/harness-<name>/ (parallel engineers never clobber each other) */
const tag = argv.includes('--tag') ? argv[argv.indexOf('--tag') + 1] : '';
const HDIR = path.join(GAME, '.cache', tag ? `harness-${tag}` : 'harness');
const dev = args.has('--dev') || args.has('--watch');
const version = JSON.parse(fs.readFileSync(path.join(GAME, 'package.json'), 'utf8')).version || '0.0.0';
const stamp = dev ? 'dev' : `${version}-${Date.now().toString(36)}`;

if (!tag) fs.mkdirSync(path.join(PUB, 'fonts'), { recursive: true });
const FONTS = [
  ['@fontsource/aref-ruqaa/files/aref-ruqaa-arabic-400-normal.woff2', 'aref-ruqaa-400.woff2'],
  ['@fontsource/aref-ruqaa/files/aref-ruqaa-arabic-700-normal.woff2', 'aref-ruqaa-700.woff2'],
  ['@fontsource/tajawal/files/tajawal-arabic-400-normal.woff2', 'tajawal-400.woff2'],
  ['@fontsource/tajawal/files/tajawal-arabic-500-normal.woff2', 'tajawal-500.woff2'],
  ['@fontsource/tajawal/files/tajawal-arabic-700-normal.woff2', 'tajawal-700.woff2'],
];
for (const [src, dst] of tag ? [] : FONTS) {
  const from = path.join(GAME, 'node_modules', src);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(PUB, 'fonts', dst));
  else console.warn('font missing:', src);
}

const common = {
  bundle: true,
  format: 'esm',
  target: ['es2020', 'safari15'],
  logLevel: 'info',
  define: { __DEV__: JSON.stringify(dev), __BUILD__: JSON.stringify(stamp) },
  loader: { '.glsl': 'text', '.css': 'css', '.woff2': 'file' },
  external: ['/fonts/*', 'fonts/*'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
};

const builds = tag ? [] : [{
  ...common,
  entryPoints: { game: path.join(GAME, 'src/main.js') },
  outdir: PUB,
}];
if (tag || args.has('--harness') || args.has('--watch')) {
  // auto-registry: every harness/<name>.js (except main.js) becomes a selectable module (?m=<name>)
  const hdir = path.join(GAME, 'harness');
  const names = fs.readdirSync(hdir).filter(f => f.endsWith('.js') && f !== 'main.js').map(f => f.slice(0, -3)).sort();
  fs.mkdirSync(HDIR, { recursive: true });
  fs.writeFileSync(path.join(HDIR, '_registry.js'),
    names.map((n, i) => `import * as m${i} from '../../harness/${n}.js';`).join('\n') + `\nexport const MODS = { ${names.map((n, i) => `'${n}': m${i}`).join(', ')} };\n`);
  builds.push({
    ...common,
    minify: false,
    sourcemap: 'inline',
    entryPoints: { harness: path.join(GAME, 'harness/main.js') },
    alias: { 'hs-registry': path.join(HDIR, '_registry.js') },
    outdir: HDIR,
  });
}

if (args.has('--watch')) {
  for (const b of builds) { const ctx = await esbuild.context(b); await ctx.watch(); }
  console.log('watching…');
} else {
  for (const b of builds) {
    const r = await esbuild.build({ ...b, metafile: true });
    for (const [file, o] of Object.entries(r.metafile.outputs)) console.log(`  ${path.relative(GAME, file)}  ${(o.bytes / 1024).toFixed(0)} KB`);
  }
  // stamp the page so browsers never mix old and new bundles
  const html = path.join(PUB, 'index.html');
  if (!tag && fs.existsSync(html)) {
    const s = fs.readFileSync(html, 'utf8').replace(/(game\.(?:js|css))\?v=[\w.-]*/g, `$1?v=${stamp}`);
    fs.writeFileSync(html, s);
  }
  console.log('build', stamp);
}
