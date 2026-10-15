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
  let content = await readFile(join(OUT, entry));
  // Úvodní stránka se mění s daty, ne s HTML.
  if (path === '/') content = Buffer.concat([content, await readFile(join(OUT, 'data', 'cafes.json'))]);
  manifest[path] = sha(content);
}
await writeFile(join(OUT, 'indexnow-manifest.json'), JSON.stringify(manifest));

console.log(`Sestaveno do _site/, ${nPages} stránek měst, ${cafes.urls.length} stránek kaváren, ${enUrls.length} anglických stránek (${key ? 's klíčem Mapy.com' : 'BEZ klíče Mapy.com, použijí se dlaždice OSM'})`);
