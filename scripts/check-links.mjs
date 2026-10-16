// Kontrola interních odkazů v hotovém _site/: každý href/src na vlastní web (/… nebo
// https://kafemapa.cz/…) musí vést na existující soubor. Volá ho scripts/build.mjs na konci,
// takže rozbitý odkaz shodí build a na web se nedostane (Cloudflare nechá běžet starou verzi).

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://kafemapa.cz';
const ATTR = /\s(?:href|src)="([^"]+)"/g;
// Cesty, které neobsluhují soubory v _site (Cloudflare je přidává sám).
const IGNORE = [/^\/cdn-cgi\//];

export async function checkLinks(outDir) {
  const exists = new Map();
  const has = async (file) => {
    if (!exists.has(file)) exists.set(file, access(join(outDir, file)).then(() => true, () => false));
    return exists.get(file);
  };
  const resolve = async (path) => {
    if (path.endsWith('/')) return (await has(path + 'index.html')) ? null : path;
    if (await has(path)) return null;
    return (await has(path + '/index.html')) ? null : path;
  };

  const broken = new Map(); // cíl → stránky, které na něj odkazují
  let checked = 0;
  for (const entry of await readdir(outDir, { recursive: true })) {
    if (!entry.endsWith('.html')) continue;
    const html = await readFile(join(outDir, entry), 'utf8');
    for (const [, raw] of html.matchAll(ATTR)) {
      let url = raw.replace(/&amp;/g, '&');
      if (url.startsWith(SITE + '/')) url = url.slice(SITE.length);
      if (!url.startsWith('/') || url.startsWith('//') || IGNORE.some((re) => re.test(url))) continue;
      const path = decodeURI(url.split(/[?#]/)[0]) || '/';
      checked++;
      const bad = await resolve(path);
      if (bad) {
        if (!broken.has(bad)) broken.set(bad, new Set());
        broken.get(bad).add('/' + entry.replace(/index\.html$/, ''));
      }
    }
  }

  if (broken.size) {
    const lines = [...broken].slice(0, 30).map(([to, from]) => `  ${to}  ← ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` a dalších ${from.size - 3}` : ''}`);
    throw new Error(`Rozbité interní odkazy (${broken.size}):\n${lines.join('\n')}${broken.size > 30 ? '\n  …' : ''}`);
  }
  return checked;
}
