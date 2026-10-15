#!/usr/bin/env node
// IndexNow: po nasazení oznámí vyhledávačům (Seznam, Bing a další), které stránky se změnily.
//
// Běží jako součást deploy příkazu v Cloudflare Workers Builds:
//   node scripts/indexnow.mjs prepare && npx wrangler deploy && node scripts/indexnow.mjs submit
//
// prepare: porovná _site/indexnow-manifest.json (hashe stránek z buildu) s manifestem,
//          který je právě nasazený na webu, a uloží seznam změněných URL.
// submit:  ten seznam pošle na api.indexnow.org (sdílí se se všemi zapojenými vyhledávači).
//
// Selhání IndexNow nikdy nesmí shodit nasazení, proto vše končí exit 0.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kafemapa.cz';
const HOST = 'kafemapa.cz';
const PENDING = join(ROOT, '.indexnow-pending.json');
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function findKey(dir = ROOT) {
  const f = (await readdir(dir)).find((n) => /^[0-9a-f]{32}\.txt$/.test(n));
  return f ? f.slice(0, -4) : null;
}

async function prepare() {
  const built = JSON.parse(await readFile(join(ROOT, '_site', 'indexnow-manifest.json'), 'utf8'));
  let live = {};
  const res = await fetch(`${SITE}/indexnow-manifest.json?t=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) live = await res.json();
  else if (res.status !== 404) throw new Error(`živý manifest: HTTP ${res.status}`);

  const changed = Object.keys(built).filter((path) => built[path] !== live[path]);
  await writeFile(PENDING, JSON.stringify(changed));
  console.log(`IndexNow: ${changed.length} změněných stránek z ${Object.keys(built).length}`);
}

async function submit() {
  let changed;
  try {
    changed = JSON.parse(await readFile(PENDING, 'utf8'));
  } catch {
    console.log('IndexNow: nic k odeslání (prepare neproběhl).');
    return;
  }
  if (!changed.length) {
    console.log('IndexNow: beze změn, nic se neposílá.');
    return;
  }
  const key = await findKey();
  if (!key) throw new Error('chybí soubor s klíčem <32 hex>.txt');
  const urlList = changed.map((p) => SITE + p);
  for (let i = 0; i < urlList.length; i += 10_000) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, keyLocation: `${SITE}/${key}.txt`, urlList: urlList.slice(i, i + 10_000) }),
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`IndexNow: odesláno ${urlList.slice(i, i + 10_000).length} URL → HTTP ${res.status}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'prepare' || cmd === 'submit') {
  try {
    await (cmd === 'prepare' ? prepare() : submit());
  } catch (err) {
    console.warn(`IndexNow (${cmd}) přeskočeno: ${err.message}`);
    if (cmd === 'prepare') await writeFile(PENDING, '[]').catch(() => {}); // radši nic než všechno
  }
}
