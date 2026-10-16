#!/usr/bin/env node
// Sestaví web do _site/ pro nasazení na Cloudflare Workers (static assets).
// Klíč Mapy.com bere z proměnné prostředí MAPY_API_KEY (build variable v Cloudflare),
// lokálně případně z assets/config.js.

import { cp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages, assignCitySlugs } from './build-pages.mjs';
import { buildCafes } from './build-cafes.mjs';
import { buildChanges } from './build-changes.mjs';
import { buildEn } from './build-en.mjs';
import { buildEnMap } from './build-en-map.mjs';
import { buildHome } from './build-home.mjs';
import { checkLinks } from './check-links.mjs';
import { buildReport } from './build-report.mjs';
import { findKey } from './indexnow.mjs';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const FILES = [
  'index.html', '404.html', '_headers', 'favicon.svg', 'icon-512.png', 'og-image.png',
  'manifest.webmanifest', 'robots.txt', 'assets', 'data',
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT);
for (const f of FILES) await cp(join(ROOT, f), join(OUT, f), { recursive: true });
await rm(join(OUT, 'assets', 'config.example.js'), { force: true });

let key = process.env.MAPY_API_KEY || '';
if (!key) {
  try {
    await access(join(ROOT, 'assets', 'config.js'));
    key = /MAPY_API_KEY\s*=\s*['"]([^'"]*)['"]/.exec(await readFile(join(ROOT, 'assets', 'config.js'), 'utf8'))?.[1] || '';
  } catch {}
}
await writeFile(join(OUT, 'assets', 'config.js'), `export const MAPY_API_KEY = ${JSON.stringify(key)};\n`);

const data = JSON.parse(await readFile(join(ROOT, 'data', 'cafes.json'), 'utf8'));
assignCitySlugs(data);
const cafes = await buildCafes(OUT, data);
const reportUrls = await buildReport(ROOT, OUT, data);
const changeUrls = await buildChanges(ROOT, OUT, data);
const enUrls = [...(await buildEnMap(ROOT, OUT)), ...(await buildEn(OUT, data)), ...cafes.enUrls];
await buildHome(OUT, data);

// Návratová adresa přihlášení do OSM (assets/osm.js); jen technická stránka, mimo vyhledávače.
await mkdir(join(OUT, 'osm'), { recursive: true });
await writeFile(
  join(OUT, 'osm', 'index.html'),
  `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Přihlášení do OpenStreetMap | Kafemapa</title>
  <style>body{font:16px/1.5 system-ui,sans-serif;margin:40px 20px;color:#2a1c15;background:#f6efe6}</style>
</head>
<body>
  <p id="msg" hidden>Přihlášení proběhlo, tohle okno můžete zavřít a vrátit se na <a href="/">Kafemapu</a>. · Signed in, you can close this window.</p>
  <script type="module" src="/assets/osm-callback.js"></script>
</body>
</html>
`
);
const nPages = await buildPages(OUT, data, { extraUrls: [...changeUrls, ...reportUrls, ...cafes.urls, ...enUrls], cafePaths: cafes.pathById });

// IndexNow: klíč do kořene webu a manifest hashů stránek, podle kterého
// scripts/indexnow.mjs po nasazení pozná, co se změnilo.
const indexNowKey = await findKey(ROOT);
if (indexNowKey) await cp(join(ROOT, `${indexNowKey}.txt`), join(OUT, `${indexNowKey}.txt`));
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const manifest = {};
for (const entry of await readdir(OUT, { recursive: true })) {
  if (!entry.endsWith('index.html')) continue;
  const path = '/' + entry.replace(/index\.html$/, '');
  // Datum aktualizace dat (<time data-upd>) je skoro na každé stránce a mění se denně;
  // za změnu stránky ho nepočítáme, jinak by IndexNow každý den hlásil všech ~5 800 stránek.
  let content = Buffer.from((await readFile(join(OUT, entry), 'utf8')).replace(/<time data-upd>[^<]*<\/time>/g, ''));
  // Úvodní stránka se mění s daty, ne s HTML.
  if (path === '/') content = Buffer.concat([content, await readFile(join(OUT, 'data', 'cafes.json'))]);
  manifest[path] = sha(content);
}
await writeFile(join(OUT, 'indexnow-manifest.json'), JSON.stringify(manifest));

const nLinks = await checkLinks(OUT);

// Stav nasazení pro denní kontrolu (scripts/uptime.mjs). Je ve WAF výjimce z anti-bot
// výzvy jako robots.txt, takže ho přečte i běžec GitHubu mimo ČR.
await writeFile(
  join(OUT, 'status.json'),
  JSON.stringify({
    built: new Date().toISOString(),
    data: data.osmBase || data.generated,
    places: data.cafes.length,
    pages: { cities: nPages, cafes: cafes.urls.length, en: enUrls.length, total: Object.keys(manifest).length },
    links: nLinks,
  }) + '\n'
);

console.log(`Sestaveno do _site/, odkazy v pořádku (${nLinks.toLocaleString('cs-CZ')}), ${nPages} stránek měst, ${cafes.urls.length} stránek kaváren, ${enUrls.length} anglických stránek (${key ? 's klíčem Mapy.com' : 'BEZ klíče Mapy.com, použijí se dlaždice OSM'})`);
