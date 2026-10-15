#!/usr/bin/env node
// Sestaví web do _site/ pro nasazení na Cloudflare Workers (static assets).
// Klíč Mapy.com bere z proměnné prostředí MAPY_API_KEY (build variable v Cloudflare),
// lokálně případně z assets/config.js.

import { cp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './build-pages.mjs';

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
const nPages = await buildPages(OUT, data);

console.log(`Sestaveno do _site/, ${nPages} stránek měst (${key ? 's klíčem Mapy.com' : 'BEZ klíče Mapy.com, použijí se dlaždice OSM'})`);
