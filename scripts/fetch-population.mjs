#!/usr/bin/env node
// Stáhne počty obyvatel obcí z otevřených dat ČSÚ (sada OBY02A „Počet obyvatel podle pohlaví“)
// a zapíše nejnovější stav k 1. 1. do data/obyvatele.json. Data vycházejí jednou ročně
// (jaro), takže skript stačí spustit po vydání nového ročníku, týdenní aktualizace ho nevolá.
//
//   node scripts/fetch-population.mjs
//
// Zdroj: Český statistický úřad, https://data.csu.gov.cz/datastat/info/SADA/OBY02A
// Soubor má ~200 MB (všechna území od roku 2000), proto se čte po řádcích.

import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'obyvatele.json');
const URL_CSV = 'https://data.csu.gov.cz/opendata/sady/OBY02A/distribuce/csv';

const res = await fetch(URL_CSV);
if (!res.ok) throw new Error(`ČSÚ: HTTP ${res.status}`);

// Sloupce: Ukazatel, IndicatorType, Pohlaví, POHL2, Roky, CasR, Všechna území, UZ…, Hodnota
// Obce mají šestimístný kód začínající 5 (kraje CZ0…, okresy CZ0…, ORP čtyřmístné).
const byYear = new Map();
let header;
// Typy fetch (DOM) a node:stream/web se v TypeScriptu rozcházejí, za běhu jde o tentýž stream.
const body = /** @type {import('node:stream/web').ReadableStream} */ (/** @type {unknown} */ (res.body));
for await (const line of createInterface({ input: Readable.fromWeb(body) })) {
  const f = line.slice(1, -1).split('","');
  if (!header) {
    header = f;
    continue;
  }
  if (f[1] !== '2406P' || f[3] !== '0' || !/^5\d{5}$/.test(f[7])) continue; // stav k 1. 1., obě pohlaví
  const m = /^(.*) \(okr\. (.*)\)$/.exec(f[6]);
  if (!byYear.has(f[4])) byYear.set(f[4], []);
  byYear.get(f[4]).push([m ? m[1] : f[6], m ? m[2] : '', +f[8], f[7]]);
}

const year = [...byYear.keys()].sort().at(-1);
const obce = byYear.get(year).sort((a, b) => a[0].localeCompare(b[0], 'cs') || a[1].localeCompare(b[1], 'cs'));
if (obce.length < 6000) throw new Error(`ČSÚ: čekal jsem ~6 250 obcí, přišlo ${obce.length}`);

await writeFile(
  OUT,
  JSON.stringify({
    source: 'Český statistický úřad, Počet obyvatel podle pohlaví (OBY02A)',
    url: 'https://data.csu.gov.cz/datastat/info/SADA/OBY02A',
    asOf: `${year}-01-01`,
    // [název obce, okres, počet obyvatel, kód obce]
    obce,
  }) + '\n',
);
console.log(`Zapsáno ${obce.length} obcí k 1. 1. ${year} → ${OUT}`);
