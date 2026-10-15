#!/usr/bin/env node
// Stáhne kavárny, obchody s kávou a pražírny v ČR z OpenStreetMap (Overpass API)
// a zapíše kompaktní data pro web do data/cafes.json.
//
//   node scripts/fetch-data.mjs            # stáhne čerstvá data
//   node scripts/fetch-data.mjs raw.json   # použije už stažený Overpass JSON

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'cafes.json');

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Relace 51684 = Česko
const QUERY = `[out:json][timeout:240];
area(id:3600051684)->.cz;
(
  nwr["amenity"="cafe"](area.cz);
  nwr["shop"="coffee"](area.cz);
  nwr["craft"="coffee_roaster"](area.cz);
  node["place"~"^(city|town)$"](area.cz);
);
out center tags;`;

async function fetchOverpass() {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of MIRRORS) {
      try {
        process.stderr.write(`→ ${url} (pokus ${attempt + 1})… `);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'kafemapa.cz data build (https://kafemapa.cz)',
          },
          body: 'data=' + encodeURIComponent(QUERY),
          signal: AbortSignal.timeout(300_000),
        });
        const text = await res.text();
        if (!res.ok || !text.startsWith('{')) throw new Error(`HTTP ${res.status}`);
        const json = JSON.parse(text);
        if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
        process.stderr.write(`OK (${json.elements.length} prvků)\n`);
        return json;
      } catch (err) {
        lastErr = err;
        process.stderr.write(`chyba: ${err.message}\n`);
      }
    }
    await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
  }
  throw lastErr;
}

const yes = (v) => v === 'yes' || v === 'only';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Dosah města roste s počtem obyvatel: malé město ~3 km, Praha 14 km.
const cityRadiusKm = (pop) => Math.min(14, Math.max(2.5, 2 + Math.sqrt(pop) / 60));

function cleanUrl(u) {
  if (!u) return undefined;
  u = u.split(';')[0].trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try {
    return new URL(u).href;
  } catch {
    return undefined;
  }
}

function socialUrl(v, base) {
  if (!v) return undefined;
  v = v.split(';')[0].trim();
  if (/^https?:\/\//i.test(v)) return cleanUrl(v);
  if (/^(www\.)?(facebook|instagram)\.com/i.test(v)) return cleanUrl(v);
  return base + v.replace(/^@/, '');
}

function address(t) {
  const num = t['addr:housenumber'] || t['addr:conscriptionnumber'] || t['addr:streetnumber'];
  const street = t['addr:street'] || t['addr:place'];
  const line1 = [street, num].filter(Boolean).join(' ');
  const city = t['addr:city'];
  return [line1, city].filter(Boolean).join(', ') || undefined;
}

// Bitové příznaky — musí odpovídat assets/app.js
export const F = {
  WIFI: 1,
  OUTDOOR: 2,
  WHEELCHAIR: 4,
  VEGAN: 8,
  CHAIN: 16,
  VEGETARIAN: 32,
  WHEELCHAIR_LIMITED: 64,
  CARD: 128,
};

function build(raw) {
  const places = [];
  const cafes = [];
  let skippedUnnamed = 0;

  for (const e of raw.elements) {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;

    if (t.place) {
      const pop = parseInt(String(t.population || '').replace(/\D/g, ''), 10) || 0;
      places.push({ n: t.name, pop, y: lat, x: lon, r: cityRadiusKm(pop), count: 0 });
      continue;
    }
    if (!t.name) {
      skippedUnnamed++;
      continue;
    }

    const kind = t.amenity === 'cafe' ? 0 : 1; // 1 = obchod s kávou / pražírna
    let f = 0;
    if (['wlan', 'yes', 'customers', 'wifi'].includes(t.internet_access)) f |= F.WIFI;
    if (t.outdoor_seating && t.outdoor_seating !== 'no') f |= F.OUTDOOR;
    if (t.wheelchair === 'yes') f |= F.WHEELCHAIR;
    else if (t.wheelchair === 'limited') f |= F.WHEELCHAIR_LIMITED;
    if (yes(t['diet:vegan'])) f |= F.VEGAN;
    if (yes(t['diet:vegetarian']) || yes(t['diet:vegan'])) f |= F.VEGETARIAN;
    if (t.brand || t['brand:wikidata']) f |= F.CHAIN;
    if (yes(t['payment:cards']) || yes(t['payment:credit_cards']) || yes(t['payment:debit_cards']) || yes(t['payment:contactless']))
      f |= F.CARD;

    const c = {
      i: e.type[0] + e.id,
      n: t.name.trim(),
      y: +lat.toFixed(6),
      x: +lon.toFixed(6),
    };
    if (kind) c.k = kind;
    if (f) c.f = f;
    if (t.opening_hours) c.o = t.opening_hours.trim();
    const web = cleanUrl(t.website || t['contact:website'] || t.url);
    if (web) c.w = web;
    const phone = t.phone || t['contact:phone'];
    if (phone) c.p = phone.split(';')[0].trim();
    const adr = address(t);
    if (adr) c.a = adr;
    const ig = socialUrl(t['contact:instagram'] || t.instagram, 'https://www.instagram.com/');
    if (ig) c.ig = ig;
    const fb = socialUrl(t['contact:facebook'] || t.facebook, 'https://www.facebook.com/');
    if (fb) c.fb = fb;
    if (t.brand) c.b = t.brand;
    if (t.craft === 'coffee_roaster' || /roast/i.test(t.cuisine || '')) c.r = 1;
    if (t.description) c.d = t.description.slice(0, 280);
    if (t.level) c.l = t.level;
    cafes.push(c);
  }

  // Přiřazení k nejbližšímu městu (vzdálenost normalizovaná dosahem města).
  for (const c of cafes) {
    let best = -1;
    let bestScore = 1;
    for (let j = 0; j < places.length; j++) {
      const p = places[j];
      if (Math.abs(p.y - c.y) > 0.15 || Math.abs(p.x - c.x) > 0.25) continue;
      const score = haversineKm(c.y, c.x, p.y, p.x) / p.r;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best >= 0) {
      c.c = best;
      places[best].count++;
    }
  }

  // Seřadit města podle počtu kaváren, indexy přemapovat.
  const order = places.map((p, i) => i).sort((a, b) => places[b].count - places[a].count || places[b].pop - places[a].pop);
  const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const cities = order.map((i) => {
    const { n, pop, y, x, count } = places[i];
    return { n, pop, y: +y.toFixed(5), x: +x.toFixed(5), count };
  });
  for (const c of cafes) if (c.c != null) c.c = remap.get(c.c);

  cafes.sort((a, b) => a.n.localeCompare(b.n, 'cs'));

  return {
    generated: new Date().toISOString(),
    osmBase: raw.osm3s?.timestamp_osm_base,
    license: 'Data © přispěvatelé OpenStreetMap, ODbL 1.0',
    skippedUnnamed,
    cities,
    cafes,
  };
}

export function statsEntry(out) {
  const c = out.cafes;
  return {
    date: (out.osmBase || out.generated).slice(0, 10),
    places: c.length,
    withHours: c.filter((x) => x.o).length,
    withAddress: c.filter((x) => x.a).length,
    withWebsite: c.filter((x) => x.w).length,
  };
}

const rawPath = process.argv[2];
const raw = rawPath ? JSON.parse(await readFile(rawPath, 'utf8')) : await fetchOverpass();
const out = build(raw);
if (out.cafes.length < 1000) {
  // Pojistka: nepřepisovat dobrá data podezřele malým výsledkem.
  console.error(`Podezřele málo kaváren (${out.cafes.length}), data nezapisuji.`);
  process.exit(1);
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));

// Historie úplnosti dat: jeden záznam za den dat z OSM (opakované stažení ho přepíše).
const HISTORY = join(ROOT, 'data', 'stats-history.json');
let history = [];
try {
  history = JSON.parse(await readFile(HISTORY, 'utf8'));
} catch {}
const entry = statsEntry(out);
history = history.filter((h) => h.date !== entry.date).concat(entry).sort((a, b) => a.date.localeCompare(b.date));
await writeFile(HISTORY, JSON.stringify(history, null, 1) + '\n');
console.log(
  `Zapsáno ${out.cafes.length} míst, ${out.cities.length} měst → ${OUT} ` +
    `(${(JSON.stringify(out).length / 1024).toFixed(0)} kB, bez jména vynecháno ${out.skippedUnnamed})`
);
