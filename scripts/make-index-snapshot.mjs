#!/usr/bin/env node
// Spočítá čísla pro Kavárenský index z aktuálních dat a zmrazí je do
// data/kavarensky-index/<edice>.json. Stránka edice se pak generuje jen ze
// snapshotu, takže citovaná čísla se týdenní aktualizací dat nezmění.
//
//   node scripts/make-index-snapshot.mjs podzim-2026 "Podzim 2026"

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHours } from '../assets/hours.js';
import { slugify, MIN_CAFES } from './build-pages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, name] = process.argv.slice(2);
if (!slug || !name) {
  console.error('Použití: node scripts/make-index-snapshot.mjs <slug> "<Název edice>"');
  process.exit(1);
}

const data = JSON.parse(await readFile(join(ROOT, 'data', 'cafes.json'), 'utf8'));
const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16 };
const REGIONAL = ['Praha', 'Brno', 'Ostrava', 'Plzeň', 'Liberec', 'Olomouc', 'České Budějovice', 'Hradec Králové',
  'Ústí nad Labem', 'Pardubice', 'Zlín', 'Karlovy Vary', 'Jihlava'];
const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

const all = data.cafes;
const cafes = all.filter((c) => !c.k);
const share = (n, of) => +(n / of).toFixed(4);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const perCapita = (c) => +((c.count / c.pop) * 10000).toFixed(2);
const hasPage = (c) => c.count >= MIN_CAFES;
const city = (c) => ({ n: c.n, pop: c.pop, count: c.count, r: perCapita(c), slug: hasPage(c) ? slugify(c.n) : null });

// Otevírací doba: pravidla vyhodnocujeme k datu dat (sezónní zápisy).
const asOf = new Date(data.osmBase || data.generated);
const withWeek = cafes.map((c) => ({ c, w: parseHours(c.o, asOf) })).filter((x) => x.w);
const isNonstop = (w) => w.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440);
const nonstop = withWeek.filter((x) => isNonstop(x.w));
const regular = withWeek.filter((x) => !isNonstop(x.w));
const WED = 2;
const opens = regular.map((x) => x.w[WED][0]?.[0]).filter((v) => v != null && v > 0); // 0:00 = noční přesah, ne otevření
const closes = regular.map((x) => x.w[WED].at(-1)?.[1]).filter((v) => v != null);
const indie = regular.filter((x) => !(x.c.f & F.CHAIN));

const hist = [];
for (let h = 5; h <= 19; h++) hist.push({ h, n: opens.filter((m) => Math.floor(m / 60) === h).length });

const brands = {};
for (const c of all) if (c.b) brands[c.b] = (brands[c.b] || 0) + 1;

const names = cafes.map((c) => c.n.toLowerCase());
const nameWords = [
  ['Café / Cafe', /\bcaf[eé]\b/],
  ['Kavárna', /kavárn/],
  ['Coffee', /coffee/],
  ['Cukrárna', /cukrár/],
  ['Kafe', /\bkaf[eé]/],
  ['Bistro', /bistro/],
].map(([w, re]) => ({ w, n: names.filter((n) => re.test(n)).length }));

const byCity = new Map();
for (const c of all) if (c.c != null) byCity.set(c.c, [...(byCity.get(c.c) || []), c]);
const completeness = [...byCity]
  .filter(([, cs]) => cs.length >= 20)
  .map(([i, cs]) => ({ ...city(data.cities[i]), hours: share(cs.filter((c) => c.o).length, cs.length) }))
  .sort((a, b) => b.hours - a.hours);

const big = data.cities.filter((c) => c.pop >= 10000).sort((a, b) => perCapita(b) - perCapita(a));

const snapshot = {
  edition: { slug, name, dataDate: (data.osmBase || data.generated).slice(0, 10), created: new Date().toISOString().slice(0, 10) },
  totals: {
    places: all.length,
    cafes: cafes.length,
    shops: all.length - cafes.length,
    chains: all.filter((c) => c.f & F.CHAIN).length,
    chainShare: share(all.filter((c) => c.f & F.CHAIN).length, all.length),
    withHours: all.filter((c) => c.o).length,
    hoursShare: share(all.filter((c) => c.o).length, all.length),
    parsedHours: withWeek.length,
    outdoorShare: share(cafes.filter((c) => c.f & F.OUTDOOR).length, cafes.length),
    wifiShare: share(cafes.filter((c) => c.f & F.WIFI).length, cafes.length),
    wheelchairShare: share(cafes.filter((c) => c.f & F.WHEELCHAIR).length, cafes.length),
    unassigned: all.filter((c) => c.c == null).length,
    citiesOver10k: big.length,
    cities: data.cities.length,
  },
  perCapitaTop: big.slice(0, 15).map(city),
  perCapitaBottom: big.filter((c) => c.pop >= 20000).slice(-10).reverse().map(city),
  regional: REGIONAL.map((n) => data.cities.find((c) => c.n === n)).map(city).sort((a, b) => b.r - a.r),
  hours: {
    sample: regular.length,
    hist,
    medianOpen: median(opens),
    medianClose: median(closes),
    indieMedianOpen: median(indie.map((x) => x.w[WED][0]?.[0]).filter((v) => v != null && v > 0)),
    openBy7: share(regular.filter((x) => x.w[WED].some(([a]) => a <= 7 * 60)).length, regular.length),
    fridayAfter21: share(regular.filter((x) => x.w[4].some(([, b]) => b > 21 * 60)).length, regular.length),
    weekdays: DAYS.map((d, i) => ({ d, share: share(regular.filter((x) => x.w[i].length).length, regular.length) })),
    closedMondayOnly: regular.filter((x) => !x.w[0].length && [1, 2, 3, 4, 5, 6].every((i) => x.w[i].length)).length,
  },
  nonstop: { n: nonstop.length, chains: nonstop.filter((x) => x.c.f & F.CHAIN).length },
  brands: Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, n]) => ({ b, n })),
  names: nameWords.sort((a, b) => b.n - a.n),
  completeness: { best: completeness.slice(0, 5), worst: completeness.slice(-5).reverse() },
};

// Tečková mapa všech míst (zmrazená spolu s čísly). Barvy podle schématu přímo v SVG,
// protože se vkládá jako <img>.
function dotMap() {
  const W = 760, H = 440, PAD = 14;
  const k = Math.cos((49.8 * Math.PI) / 180);
  const [minX, maxX, minY, maxY] = [12.09 * k, 18.86 * k, 48.55, 51.06];
  const sc = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const xy = (lat, lon) => [PAD + (lon * k - minX) * sc, PAD + (maxY - lat) * sc];
  const dots = all.map((c) => {
    const [x, y] = xy(c.y, c.x);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.9"/>`;
  });
  const labels = ['Praha', 'Brno', 'Ostrava', 'Plzeň', 'Olomouc', 'České Budějovice', 'Liberec', 'Hradec Králové']
    .map((n) => data.cities.find((c) => c.n === n))
    .map((c) => {
      const [x, y] = xy(c.y, c.x);
      return `<text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}">${c.n}</text>`;
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tečková mapa ${all.length} míst s kávou v Česku">
<style>circle{fill:#b5652b;fill-opacity:.6}text{font:600 13px Inter,system-ui,sans-serif;fill:#2a1c15;paint-order:stroke;stroke:#f6efe6;stroke-width:3px}
@media (prefers-color-scheme:dark){circle{fill:#cf7f3c;fill-opacity:.7}text{fill:#f4e9df;stroke:#1b1411}}</style>
<g>${dots.join('')}</g><g>${labels.join('')}</g></svg>
`;
}
await mkdir(join(ROOT, 'data', 'kavarensky-index'), { recursive: true });
await writeFile(join(ROOT, 'data', 'kavarensky-index', `${slug}-mapa.svg`), dotMap());

const out = join(ROOT, 'data', 'kavarensky-index', `${slug}.json`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Snapshot ${name} → ${out}`);
