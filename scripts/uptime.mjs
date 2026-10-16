#!/usr/bin/env node
// Denní kontrola živého webu (GitHub Actions, .github/workflows/uptime.yml). Když něco selže,
// skončí chybou a GitHub pošle e-mail.
//
//   node scripts/uptime.mjs
//
// Běžce GitHubu jsou mimo ČR, kde Cloudflare HTML stránky chrání anti-bot výzvou. Proto:
// - /status.json (zapisuje ho build) je ve WAF výjimce; z něj čteme stáří dat a počty stránek,
//   tím odhalíme i tiše selhávající denní aktualizaci nebo poloviční build;
// - u úvodní stránky stačí, že web odpovídá: buď stránkou, nebo výzvou Cloudflare.
//   Obsah stránek hlídá už build (kontrola odkazů), tady jde o to, jestli web běží.

const SITE = process.env.SITE || 'https://kafemapa.cz';
const MAX_DATA_AGE_DAYS = 3;
const headers = { 'user-agent': 'kafemapa-uptime (+https://kafemapa.cz/)' };
const problems = [];

async function fetchOk(path, opts = {}) {
  try {
    return await fetch(SITE + path, { headers, signal: AbortSignal.timeout(20_000), ...opts });
  } catch (e) {
    problems.push(`${path}: ${e.message}`);
  }
}

// 1. Web odpovídá (stránka, nebo výzva Cloudflare, nikdy chyba serveru)
const home = await fetchOk('/');
if (home) {
  const challenged = home.headers.get('cf-mitigated') === 'challenge';
  if (home.status === 200 || challenged) console.log(`OK  / (${challenged ? 'výzva Cloudflare, web běží' : 'HTTP 200'})`);
  else problems.push(`/: HTTP ${home.status}`);
}

// 2. Stav nasazení a čerstvost dat
const res = await fetchOk(`/status.json?t=${Date.now()}`, { cache: 'no-store' });
if (res && res.status !== 200) problems.push(`/status.json: HTTP ${res.status}`);
else if (res) {
  const s = await res.json();
  const days = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (!(days(s.data) < MAX_DATA_AGE_DAYS)) problems.push(`data jsou ${days(s.data).toFixed(1)} dne stará (denní aktualizace asi selhává, viz Actions → Aktualizace dat z OSM)`);
  if (!(s.places > 3000)) problems.push(`v datech je jen ${s.places} míst`);
  if (!(s.pages?.cafes > 2000 && s.pages?.cities > 80 && s.pages?.total > 4000)) problems.push(`podezřele málo stránek: ${JSON.stringify(s.pages)}`);
  if (!problems.length) console.log(`OK  /status.json: data z ${s.data.slice(0, 10)}, ${s.places} míst, ${s.pages.total} stránek, build ${s.built.slice(0, 16).replace('T', ' ')} UTC`);
}

// 3. Strojové soubory pro vyhledávače
for (const [path, must] of [['/robots.txt', 'Sitemap:'], ['/sitemap.xml', '<urlset']]) {
  const r = await fetchOk(path);
  if (!r) continue;
  const body = await r.text();
  if (r.status !== 200 || !body.includes(must)) problems.push(`${path}: HTTP ${r.status}${r.status === 200 ? `, chybí „${must}“` : ''}`);
  else console.log(`OK  ${path}`);
}

if (problems.length) {
  console.error(`\nProblémy (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nVše v pořádku.');
