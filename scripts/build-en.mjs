// Anglická verze statických stránek pro turisty:
//   /en/cities/, /en/cities/<town>/, /en/cafe/<slug>/, /en/help/
// Texty jsou psané pro angličtinu (ne strojově z češtiny); data i odkazy sdílí s českou verzí.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';
import { cafePath, cityNameIn } from '../assets/slug.js';
import { head, foot, esc, breadcrumbLd, SITE, MIN_CAFES, cityEnSlug } from './build-pages.mjs';

const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const num = (n) => n.toLocaleString('en-GB');
const dec = (n) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pl = (n, one, many) => (n === 1 ? one : many);
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const collator = new Intl.Collator('cs');
const fmtMin = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const fmtDist = (d) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${dec(d)} km`);
const km = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const h = Math.sin(((b.y - a.y) * rad) / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(((b.x - a.x) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const osmUrl = (c, edit) => {
  const type = { n: 'node', w: 'way', r: 'relation' }[c.i[0]];
  return edit ? `https://www.openstreetmap.org/edit?${type}=${c.i.slice(1)}` : `https://www.openstreetmap.org/${type}/${c.i.slice(1)}`;
};
const kindOf = (c) => (c.k ? (c.r ? 'Coffee roaster' : 'Coffee shop') : c.r ? 'Café & roaster' : 'Café');
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

function features(c) {
  const out = [];
  if (c.f & F.OUTDOOR) out.push('Outdoor seating');
  if (c.f & F.WIFI) out.push('Wi‑Fi');
  if (c.f & F.WHEELCHAIR) out.push('Wheelchair accessible');
  if (c.f & F.WHEELCHAIR_LIMITED) out.push('Partly wheelchair accessible');
  if (c.f & F.VEGAN) out.push('Vegan options');
  else if (c.f & F.VEGETARIAN) out.push('Vegetarian options');
  if (c.f & F.CARD) out.push('Cards accepted');
  return out;
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
        <span class="status" data-status></span>
      </div>
      ${c.a ? `<p class="cafe-addr">${esc(c.a)}</p>` : ''}
      <p class="cafe-hours${!week && c.o ? ' raw' : ''}">${hours ? esc(hours) : '<span class="muted">Opening hours unknown</span>'}</p>
      ${tg.length ? `<div class="tags">${tg.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="cafe-links"><a href="/en/#${c.i}">On the map</a>${c.w ? ` · <a href="${esc(c.w)}" rel="noopener nofollow" target="_blank">Website</a>` : ''}</p>
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
  <main class="page-main">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/en/">Kafemapa</a> › <a href="/en/cities/">Towns</a> › <span>${esc(name)}</span></nav>
    <p class="eyebrow">Cafés and coffee roasters</p>
    <h1>${esc(name)}</h1>
    ${intro.map((t) => `<p class="lead">${t}</p>`).join('\n    ')}

    <dl class="stats">
      <div><dt>Places for coffee</dt><dd>${num(n)}</dd></div>
      <div><dt>With outdoor seating</dt><dd>${num(nOutdoor)}</dd></div>
      <div><dt>Independent</dt><dd>${num(nIndie)}</dd></div>
      ${perCapita != null ? `<div><dt>Per 10,000 people</dt><dd>${dec(perCapita)}</dd></div>` : ''}
    </dl>

    <p><a class="btn primary map-cta" href="/en/?city=${cityEnSlug(city)}">Show ${esc(name)} on the map</a></p>

    <section aria-labelledby="list-h">
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

    <section aria-labelledby="near-h">
      <h2 id="near-h">Cafés in nearby towns</h2>
      <ul class="city-links">
        ${nearby.map((q) => `<li><a href="/en/cities/${cityEnSlug(q.city)}/">${esc(nameOf(q.city))}</a> <span class="muted">${num(q.cafes.length)} · ${Math.round(q.d)} km</span></li>`).join('\n        ')}
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

/* ---------------- café page ---------------- */

const helpBox = (c, label, open = false) => `<details class="help-box"${open ? ' data-primary' : ''}>
          <summary>${label}</summary>
          <div data-hours-editor data-osm-edit="${osmUrl(c, true)}"${c.o ? ` data-current="${esc(c.o)}"` : ''}></div>
        </details>`;

function cafePageEn(c, ctx) {
  const { city, path, week, nearby, data } = ctx;
  const town = nameOf(city);
  const kind = kindOf(c);
  const addr = [c.a, c.a && city && c.a.includes(city.n) ? null : town].filter(Boolean).join(', ');
  const feats = features(c);
  const hoursText = week ? formatWeek(week, 'en') : null;
  const cityPath = city?.slug ? `/en/cities/${cityEnSlug(city)}/` : null;

  const crumbs = [['Kafemapa', '/en/']];
  if (cityPath) crumbs.push(['Cafés by town', '/en/cities/'], [town, cityPath]);
  crumbs.push([c.n, path]);
  const sameAs = [c.w, c.ig, c.fb].filter(Boolean);
  const business = {
    '@context': 'https://schema.org',
    '@type': c.k ? 'Store' : 'CafeOrCoffeeShop',
    name: c.n,
    url: SITE + path,
    geo: { '@type': 'GeoCoordinates', latitude: c.y, longitude: c.x },
    ...(c.a || city ? { address: { '@type': 'PostalAddress', ...(c.a ? { streetAddress: c.a.split(',')[0] } : {}), ...(city ? { addressLocality: city.n } : {}), addressCountry: 'CZ' } } : {}),
    ...(c.p ? { telephone: c.p } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  const actions = [`<a class="btn primary" href="https://mapy.com/fnc/v1/route?end=${c.x},${c.y}" rel="noopener">Directions</a>`, `<a class="btn" href="/en/#${c.i}">On the map</a>`];
  if (c.w) actions.push(`<a class="btn" href="${esc(c.w)}" rel="noopener nofollow">Website</a>`);
  if (c.p) actions.push(`<a class="btn" href="tel:${esc(c.p.replace(/[^\d+]/g, ''))}">${esc(c.p)}</a>`);
  if (c.ig) actions.push(`<a class="btn" href="${esc(c.ig)}" rel="noopener nofollow">Instagram</a>`);
  if (c.fb) actions.push(`<a class="btn" href="${esc(c.fb)}" rel="noopener nofollow">Facebook</a>`);

  let hours;
  if (week) {
    hours = `<table class="week" data-week>
          <tbody>${DAYS.map((d, i) => {
            const iv = week[i];
            const txt = !iv.length ? 'closed' : iv.map(([a, b]) => (a === 0 && b >= 1440 ? 'open 24/7' : `${fmtMin(a)}–${fmtMin(b)}`)).join(', ');
            return `<tr data-day="${i}"><th scope="row">${d}</th><td>${txt}</td></tr>`;
          }).join('')}</tbody>
        </table>
        <p class="small muted">Public holidays and exceptions are not included. Please check before you go.</p>
        ${helpBox(c, 'Hours wrong? Fix them')}`;
  } else if (c.o) {
    hours = `<p class="cafe-hours raw">${esc(c.o)}</p>${helpBox(c, 'Hours wrong? Fix them')}`;
  } else {
    hours = `<p class="muted">Opening hours are not in OpenStreetMap yet.</p>${helpBox(c, 'Know the opening hours? Add them', true)}`;
  }

  const description = [`${kind} ${c.n}${addr ? `, ${addr}` : ''}, Czechia.`, hoursText ? `Opening hours: ${hoursText}.` : null, feats.length ? `${feats.slice(0, 3).join(', ')}.` : null]
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);

  return (
    head({
      lang: 'en',
      title: `${c.n}${city ? `, ${town}` : ''}: opening hours & address | Kafemapa`,
      description,
      path,
      alternates: { cs: cafePath(c, city?.n, 'cs'), en: path },
      jsonLd: [breadcrumbLd(crumbs), business],
    }) +
    `
  <main class="page-main cafe-page">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, p], i) => (i === crumbs.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${p}">${esc(n)}</a>`)).join(' › ')}</nav>
    <p class="eyebrow">${kind}</p>
    <h1>${esc(c.n)}</h1>
    ${addr ? `<p class="lead">${esc(addr)}</p>` : ''}
    <div class="cafe-live" data-live${c.o ? ` data-o="${esc(c.o)}"` : ''}><span class="status" data-status></span></div>
    <div class="actions">${actions.join('\n      ')}</div>
    ${c.d ? `<section><h2>Description <span class="muted small">(in Czech)</span></h2><p lang="cs">${esc(c.d)}</p></section>` : ''}
    <section>
      <h2>Opening hours</h2>
        ${hours}
    </section>
    ${feats.length ? `<section><h2>Amenities</h2><div class="tags">${feats.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>` : ''}
    ${nearby.length ? `<section>
      <h2>Other cafés nearby</h2>
      <ul class="near">
        ${nearby.map(({ c: n, d }) => `<li><a href="${cafePath(n, n.c != null ? data.cities[n.c].n : null, 'en')}">${esc(n.n)}</a> <span class="muted">${fmtDist(d)}${n.a ? ` · ${esc(n.a.split(',')[0])}` : ''}</span></li>`).join('\n        ')}
      </ul>
      ${cityPath ? `<p><a href="${cityPath}">All cafés in ${esc(town)}</a></p>` : ''}
    </section>` : ''}
    <details class="help-box report-box">
      <summary>Closed or something wrong? Report it</summary>
      <div data-report data-i="${c.i}" data-n="${esc(c.n)}" data-y="${c.y}" data-x="${c.x}"></div>
    </details>
    <p class="small muted osm-note">Data from <a href="${osmUrl(c)}" rel="noopener">OpenStreetMap</a>. Something wrong or missing? <a href="${osmUrl(c, true)}" rel="noopener">Edit it on OSM</a> — the fix shows up here within a week.</p>
  </main>
  <script type="module" src="/assets/pages.js"></script>` +
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
        <li><strong>Paste the value in the OSM editor and save.</strong> A free account on openstreetmap.org is all you need. The change shows up on Kafemapa after the next weekly update.</li>
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

export async function buildEn(outDir, data, { nearbyById }) {
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

  const asOf = new Date(data.osmBase || data.generated);
  for (const c of data.cafes) {
    const city = c.c != null ? data.cities[c.c] : null;
    const path = cafePath(c, city?.n, 'en');
    if (!path) continue;
    await write(path, cafePageEn(c, { city, path, week: parseHours(c.o, asOf), nearby: nearbyById.get(c.i) || [], data }));
  }
  return urls;
}
