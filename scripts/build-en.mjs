// Anglická verze statických stránek pro turisty:
//   /en/cities/, /en/cities/<town>/, /en/help/ (stránky kaváren v obou jazycích dělá build-cafes.mjs)
// Texty jsou psané pro angličtinu (ne strojově z češtiny); data i odkazy sdílí s českou verzí.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';
import { cafePath, cityNameIn } from '../assets/slug.js';
import { head, foot, esc, breadcrumbLd, MIN_CAFES, cityEnSlug, townBar, nearTown } from './build-pages.mjs';

const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };
const num = (n) => n.toLocaleString('en-GB');
const dec = (n) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pl = (n, one, many) => (n === 1 ? one : many);
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const collator = new Intl.Collator('cs');
const km = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const h = Math.sin(((b.y - a.y) * rad) / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(((b.x - a.x) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const nameOf = (city) => cityNameIn(city?.n, 'en');

function tags(c) {
  const t = [];
  if (c.k) t.push(c.r ? 'Roaster' : 'Coffee beans');
  else if (c.r) t.push('Roaster');
  if (c.f & F.OUTDOOR) t.push('Outdoor seating');
  if (c.f & F.WIFI) t.push('Wi‑Fi');
  if (c.f & F.WHEELCHAIR) t.push('Wheelchair accessible');
  if (c.f & F.VEGAN) t.push('Vegan');
  else if (c.f & F.VEGETARIAN) t.push('Vegetarian');
  return t;
}

/* ---------------- town page ---------------- */

function cafeItem(c, data) {
  const href = cafePath(c, c.c != null ? data.cities[c.c].n : null, 'en') || `/en/#${c.i}`;
  const week = parseHours(c.o);
  const hours = week ? formatWeek(week, 'en') : c.o || null;
  const tg = tags(c);
  return `<li class="cafe" data-f="${c.f || 0}"${c.k || c.r ? ' data-beans' : ''}${c.o ? ` data-o="${esc(c.o)}"` : ''}>
      <div class="cafe-top">
        <h3><a href="${href}">${esc(c.n)}</a></h3>
        <span class="leader" aria-hidden="true"></span>
        <span class="status" data-status></span>
      </div>
      ${c.a ? `<p class="cafe-addr">${esc(c.a)}</p>` : ''}
      <p class="cafe-hours${!week && c.o ? ' raw' : ''}">${hours ? esc(hours) : '<span class="muted">Opening hours unknown</span>'}</p>
      ${tg.length ? `<div class="tags">${tg.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="cafe-links"><a href="/en/#${c.i}">On the map</a>${c.w ? `<a href="${esc(c.w)}" rel="noopener nofollow" target="_blank">Website</a>` : ''}</p>
    </li>`;
}

function townPage(p, ctx) {
  const { city, cafes } = p;
  const { pages, rank, data } = ctx;
  const name = nameOf(city);
  const n = cafes.length;
  const count = (fn) => cafes.filter(fn).length;
  const nCafe = count((c) => !c.k);
  const nShops = n - nCafe;
  const nIndie = count((c) => !(c.f & F.CHAIN));
  const nHours = count((c) => c.o);
  const nOutdoor = count((c) => c.f & F.OUTDOOR);
  const nWifi = count((c) => c.f & F.WIFI);
  const perCapita = city.pop ? (n / city.pop) * 10000 : null;
  const r = rank.get(city);
  const path = `/en/cities/${cityEnSlug(city)}/`;
  const sorted = cafes.slice().sort((a, b) => collator.compare(a.n, b.n));
  const missing = sorted.filter((c) => !c.o);
  const nearby = pages
    .filter((q) => q.city !== city)
    .map((q) => ({ ...q, d: km(city, q.city) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  const intro = [
    `Kafemapa lists ${num(n)} ${pl(n, 'place', 'places')} for coffee around the centre of ${esc(name)}: ${num(nCafe)} ${pl(nCafe, 'café', 'cafés')}` +
      (nShops ? ` and ${num(nShops)} ${pl(nShops, 'coffee shop or roaster', 'coffee shops and roasters')}` : '') +
      `. ${num(nIndie)} of them ${nIndie === 1 ? 'is' : 'are'} independent, not part of a chain.`,
    `${num(nHours)} list their opening hours, ${num(nOutdoor)} have outdoor seating and ${num(nWifi)} offer Wi‑Fi.` +
      (r ? ` With ${dec(perCapita)} places per 10,000 inhabitants, ${esc(name)} ranks ${ordinal(r.pos)} of ${r.of} Czech towns with over 10,000 people.` : ''),
  ];

  return (
    head({
      lang: 'en',
      title: `Cafés in ${name}: ${num(n)} places for coffee | Kafemapa`,
      description: `${num(n)} cafés, coffee roasters and coffee shops in ${name}, Czechia. Opening hours, outdoor seating, Wi‑Fi and a map. What is open right now?`,
      path,
      alternates: { cs: `/kavarny/${city.slug}/`, en: path },
      jsonLd: breadcrumbLd([['Kafemapa', '/en/'], ['Cafés by town', '/en/cities/'], [name, path]]),
    }) +
    `
  <main class="page-main town-page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/en/">Kafemapa</a> › <a href="/en/cities/">Towns</a> › <span>${esc(name)}</span></nav>
    <h1>${esc(name)}</h1>
    ${intro.map((t) => `<p class="lead">${t}</p>`).join('\n    ')}

    <dl class="stats">
      <div><dt>Places for coffee</dt><dd>${num(n)}</dd></div>
      <div><dt>With outdoor seating</dt><dd>${num(nOutdoor)}</dd></div>
      <div><dt>Independent</dt><dd>${num(nIndie)}</dd></div>
      ${perCapita != null ? `<div><dt>Per 10,000 people</dt><dd>${dec(perCapita)}</dd></div>` : ''}
    </dl>

    <p><a class="btn primary map-cta" href="/en/?city=${cityEnSlug(city)}">Show ${esc(name)} on the map</a></p>

    ${townBar(
      [
        ['places', 'All places', num(n)],
        ...(missing.length ? [['missing', 'No opening hours', num(missing.length)]] : []),
        ['nearby', 'Nearby towns'],
      ],
      { label: 'Page sections', search: 'Search cafés or streets' }
    )}

    <section id="places" aria-labelledby="list-h">
      <h2 id="list-h">All places for coffee</h2>
      <div class="chips" role="group" aria-label="Filters" data-filters hidden>
        <button class="chip" data-filter="open" aria-pressed="false"><i class="dot dot-open"></i>Open now</button>
        <button class="chip" data-filter="indie" aria-pressed="false">Independent</button>
        <button class="chip" data-filter="outdoor" aria-pressed="false">Outdoor seating</button>
        <button class="chip" data-filter="wifi" aria-pressed="false">Wi‑Fi</button>
        ${count((c) => c.k || c.r) ? '<button class="chip" data-filter="beans" aria-pressed="false">Roasters &amp; beans</button>' : ''}
      </div>
      <p class="muted small" data-count aria-live="polite"></p>
      <ol class="cafes">
    ${sorted.map((c) => cafeItem(c, data)).join('\n    ')}
      </ol>
      <p class="muted small">Opening hours come from OpenStreetMap and do not include public holidays or exceptions. Please check before you go.</p>
    </section>

    ${missing.length ? `<section id="missing" aria-labelledby="missing-h">
      <h2 id="missing-h">Opening hours missing (${num(missing.length)})</h2>
      <p>Nobody has added opening hours for these places yet. Know some of them? You can add them in a minute on the café's page. <a href="/en/help/">How to help</a></p>
      <details class="missing-list">
        <summary>Show ${num(missing.length)} ${pl(missing.length, 'place', 'places')}</summary>
        <ul class="city-links">
          ${missing.map((c) => `<li><a href="${cafePath(c, city.n, 'en') || `/en/#${c.i}`}">${esc(c.n)}</a></li>`).join('\n          ')}
        </ul>
      </details>
    </section>` : ''}

    <section id="nearby" aria-labelledby="near-h">
      <h2 id="near-h">Cafés in nearby towns</h2>
      <ul class="near-towns">
        ${nearby.map((q) => nearTown(`/en/cities/${cityEnSlug(q.city)}/`, esc(nameOf(q.city)), `${num(q.cafes.length)} ${q.cafes.length === 1 ? 'place' : 'places'}, ${Math.round(q.d)} km`)).join('\n        ')}
      </ul>
    </section>
  </main>
  <script type="module" src="/assets/pages.js"></script>` +
    foot(data, 'en')
  );
}

function townsIndex(pages, data) {
  const top = pages.slice().sort((a, b) => b.cafes.length - a.cafes.length).slice(0, 12);
  const all = pages.slice().sort((a, b) => collator.compare(nameOf(a.city), nameOf(b.city)));
  return (
    head({
      lang: 'en',
      title: 'Cafés in Czech towns — Prague, Brno, Český Krumlov and more | Kafemapa',
      description: `Cafés, coffee roasters and coffee shops in ${pages.length} Czech towns, with opening hours, outdoor seating and Wi‑Fi. Open data from OpenStreetMap.`,
      path: '/en/cities/',
      alternates: { cs: '/kavarny/', en: '/en/cities/' },
      jsonLd: breadcrumbLd([['Kafemapa', '/en/'], ['Cafés by town', '/en/cities/']]),
    }) +
    `
  <main class="page-main">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/en/">Kafemapa</a> › <span>Towns</span></nav>
    <h1>Cafés by town</h1>
    <p class="lead">Kafemapa knows ${num(data.cafes.length)} cafés, roasters and coffee shops across Czechia. Here they are grouped into ${pages.length} towns with at least ${MIN_CAFES} places each; the rest are on the <a href="/en/">map</a>.</p>
    <h2>Towns with the most cafés</h2>
    <ol class="top-cities">
      ${top.map((p) => `<li><a href="/en/cities/${cityEnSlug(p.city)}/"><span class="tc-name">${esc(nameOf(p.city))}</span><span class="tc-count">${num(p.cafes.length)}</span></a></li>`).join('\n      ')}
    </ol>
    <h2>All towns A–Z</h2>
    <ul class="city-links">
      ${all.map((p) => `<li><a href="/en/cities/${cityEnSlug(p.city)}/">${esc(nameOf(p.city))}</a> <span class="muted">${num(p.cafes.length)}</span></li>`).join('\n      ')}
    </ul>
  </main>` +
    foot(data, 'en')
  );
}

/* ---------------- help page ---------------- */

function helpPage(pages, data) {
  const all = data.cafes;
  const withHours = all.filter((c) => c.o).length;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const rows = pages
    .map((p) => ({ p, missing: p.cafes.filter((c) => !c.o).length, done: p.cafes.filter((c) => c.o).length / p.cafes.length }))
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 15);
  return (
    head({
      lang: 'en',
      title: 'Help improve the café data | Kafemapa',
      description: `${num(all.length - withHours)} cafés in Czechia have no opening hours yet. Add them on OpenStreetMap in a minute and help every map that uses it.`,
      path: '/en/help/',
      alternates: { cs: '/doplnit/', en: '/en/help/' },
      jsonLd: breadcrumbLd([['Kafemapa', '/en/'], ['Help improve the data', '/en/help/']]),
    }) +
    `
  <main class="page-main report">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/en/">Kafemapa</a> › <span>Help improve the data</span></nav>
    <h1>Help improve the café data</h1>
    <p class="lead">Kafemapa knows the opening hours of ${pct(withHours / all.length)} of places. For the other ${num(all.length - withHours)} we do not know when they are open, so they cannot appear under “Open now”. The data comes from OpenStreetMap, the open map built by volunteers — whatever you add there also improves every other map and app that uses it.</p>
    <section>
      <h2>How to help</h2>
      <ol class="steps">
        <li><strong>Find the café</strong> on the <a href="/en/">map</a> or in a town list below.</li>
        <li><strong>Open “Know the opening hours?”</strong> and fill in the times per day. Kafemapa turns them into the correct OpenStreetMap format.</li>
        <li><strong>Paste the value in the OSM editor and save.</strong> A free account on openstreetmap.org is all you need. The change shows up on Kafemapa by the next day.</li>
      </ol>
      <aside class="cta">
        <h3>The one rule</h3>
        <p>Only add what you know first-hand: from a visit, the sign on the door, or the café's own website and social media. <strong>Do not copy data from Google Maps or other maps</strong> — their licences do not allow it and OpenStreetMap would have to delete it.</p>
      </aside>
      <p>Sitting in a café right now? The <a href="https://streetcomplete.app/" rel="noopener">StreetComplete</a> app (Android) asks about missing details, including opening hours, on the spot. With <a href="https://every-door.app/" rel="noopener">Every Door</a> (Android and iPhone) you can edit cafés and shops on OpenStreetMap from your phone. Closed café? Use “Closed or something wrong? Report it” on its page.</p>
    </section>
    <section>
      <h2>Where most data is missing</h2>
      <ul class="city-links">
        ${rows.map((r) => `<li><a href="/en/cities/${cityEnSlug(r.p.city)}/#missing">${esc(nameOf(r.p.city))}</a> <span class="muted">${num(r.missing)} missing · ${pct(r.done)} complete</span></li>`).join('\n        ')}
      </ul>
    </section>
  </main>` +
    foot(data, 'en')
  );
}

/* ---------------- build ---------------- */

export async function buildEn(outDir, data) {
  // stejná města jako česká verze (assignCitySlugs už nastavil city.slug)
  const byCity = new Map();
  for (const c of data.cafes) if (c.c != null) byCity.set(c.c, [...(byCity.get(c.c) || []), c]);
  const pages = data.cities.filter((c) => c.slug).map((city) => ({ city, cafes: byCity.get(data.cities.indexOf(city)) || [] }));
  const ranked = data.cities.filter((c) => c.pop >= 10000).sort((a, b) => b.count / b.pop - a.count / a.pop);
  const rank = new Map(ranked.map((c, i) => [c, { pos: i + 1, of: ranked.length }]));
  const urls = ['/en/cities/', '/en/help/'];
  const write = async (path, html) => {
    await mkdir(join(outDir, path), { recursive: true });
    await writeFile(join(outDir, path, 'index.html'), html);
    urls.push(path);
  };

  for (const p of pages) await write(`/en/cities/${cityEnSlug(p.city)}/`, townPage(p, { pages, rank, data }));
  urls.splice(urls.indexOf('/en/cities/'), 1);
  await mkdir(join(outDir, 'en', 'cities'), { recursive: true });
  await writeFile(join(outDir, 'en', 'cities', 'index.html'), townsIndex(pages, data));
  urls.push('/en/cities/');
  urls.splice(urls.indexOf('/en/help/'), 1);
  await write('/en/help/', helpPage(pages, data));

  return urls;
}
