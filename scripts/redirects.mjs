// Přesměrování starých adres stránek kaváren. Adresa obsahuje jméno a město, takže
// přejmenování v OSM by z ní udělalo 404 a Google by stránku vyřadil. Podle OSM id
// (konec adresy, nemění se) víme, kam stará adresa patří.
//
// data/old-paths.json: { "<stará adresa>": "<osm id>" }, doplňuje ho fetch-data.mjs při každém stažení.
// Build z něj vyrobí _site/_redirects (Cloudflare Workers static assets).

import { cafePath } from '../assets/slug.js';

const LANGS = /** @type {const} */ (['cs', 'en']);
// Cloudflare: nejvýš 2 000 statických přesměrování v jednom _redirects.
export const MAX_REDIRECTS = 2000;

/** Aktuální adresy stránek podle id: id → { cs, en } (jen místa s vlastní stránkou). */
export function currentPaths(data) {
  /** @type {Map<string, { cs: string, en: string }>} */
  const paths = new Map();
  for (const c of data.cafes) {
    const city = c.c != null ? data.cities[c.c]?.n : null;
    const cs = cafePath(c, city, 'cs');
    if (cs) paths.set(c.i, { cs, en: cafePath(c, city, 'en') });
  }
  return paths;
}

/** Zapamatuje si adresy z předchozích dat, které v nových datech už neplatí. Vrací nový objekt. */
export function recordOldPaths(old, prev, next) {
  const before = currentPaths(prev);
  const now = currentPaths(next);
  const out = { ...old };
  for (const [id, p] of before) {
    for (const lang of LANGS) if (p[lang] !== now.get(id)?.[lang]) out[p[lang]] = id;
  }
  // Adresa, která zase platí (přejmenování zpět), přesměrování nepotřebuje.
  for (const p of now.values()) for (const lang of LANGS) delete out[p[lang]];
  return out;
}

/** Řádky _redirects: na aktuální stránku (301), na místo na mapě, když stránku ztratilo (302). */
export function redirectLines(old, data) {
  const now = currentPaths(data);
  const onMap = new Set(data.cafes.map((c) => c.i));
  const lines = [];
  for (const [from, id] of Object.entries(old)) {
    const lang = from.startsWith('/en/') ? 'en' : 'cs';
    const to = now.get(id)?.[lang];
    if (to) lines.push(`${from} ${to} 301`);
    // Místo zůstalo jen na mapě (např. přišlo o adresu i otevírací dobu); 302, stránka se může vrátit.
    else if (onMap.has(id)) lines.push(`${from} ${lang === 'en' ? '/en/' : '/'}#${id} 302`);
    // Místo z OSM zmizelo: poctivé 404.
  }
  return lines.sort();
}
