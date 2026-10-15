// Stránka pro každou nezávislou kavárnu s dostatkem údajů: /kavarna/<jméno>-<město>-<osm id>/
// Kvůli vyhledávání podle jména („Monogram Brno otevírací doba“). Volá ji scripts/build.mjs.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';
import { cafePath } from '../assets/slug.js';
import { head, foot, esc, breadcrumbLd, SITE } from './build-pages.mjs';

const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };
const DAY_LONG = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const NEARBY = 6;

const fmtMin = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const km = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const h = Math.sin(((b.y - a.y) * rad) / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(((b.x - a.x) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtDist = (d) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1).replace('.', ',')} km`);
const osmUrl = (c, edit) => {
  const type = { n: 'node', w: 'way', r: 'relation' }[c.i[0]];
  return edit ? `https://www.openstreetmap.org/edit?${type}=${c.i.slice(1)}` : `https://www.openstreetmap.org/${type}/${c.i.slice(1)}`;
};

function features(c) {
  const out = [];
  if (c.f & F.OUTDOOR) out.push('Zahrádka');
  if (c.f & F.WIFI) out.push('Wi‑Fi');
  if (c.f & F.WHEELCHAIR) out.push('Bezbariérový vstup');
  if (c.f & F.WHEELCHAIR_LIMITED) out.push('Částečně bezbariérové');
  if (c.f & F.VEGAN) out.push('Veganské možnosti');
  else if (c.f & F.VEGETARIAN) out.push('Vegetariánské možnosti');
  if (c.f & F.CARD) out.push('Platba kartou');
  return out;
}

// schema.org openingHours přijímá jen prosté „Mo-Fr 08:00-18:00“; svátky (PH), měsíce
// a poznámky z OSM by byly neplatné, takže je radši vynecháme celé.
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const RULE = new RegExp(`^${DAY}(?:[-,]${DAY})* \\d{2}:\\d{2}-\\d{2}:\\d{2}(?:,\\d{2}:\\d{2}-\\d{2}:\\d{2})*$`);
function schemaHours(o) {
  if (!o) return null;
  const rules = o.split(';').map((r) => r.trim().replace(/\s*,\s*/g, ',')).filter(Boolean);
  return rules.length && rules.every((r) => RULE.test(r)) ? rules : null;
}

const kindOf = (c) => (c.k ? (c.r ? 'Pražírna' : 'Obchod s kávou') : c.r ? 'Kavárna a pražírna' : 'Kavárna');

function cafePage(c, ctx) {
  const { city, path, week, nearby, meta } = ctx;
  const cityHasPage = !!city?.slug;
  const kind = kindOf(c);
  const addr = [c.a, c.a && city && c.a.includes(city.n) ? null : city?.n].filter(Boolean).join(', ');
  const feats = features(c);
  const hoursText = week ? formatWeek(week) : null;

  const title = `${c.n}${city ? `, ${city.n}` : ''}: otevírací doba a adresa | Kafemapa`;
  const description = [
    `${kind} ${c.n}${addr ? `, ${addr}` : ''}.`,
    hoursText ? `Otevírací doba: ${hoursText}.` : null,
    feats.length ? `${feats.slice(0, 3).join(', ')}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);

  const sameAs = [c.w, c.ig, c.fb].filter(Boolean);
  const business = {
    '@context': 'https://schema.org',
    '@type': c.k ? 'Store' : 'CafeOrCoffeeShop',
    name: c.n,
    url: SITE + path,
    geo: { '@type': 'GeoCoordinates', latitude: c.y, longitude: c.x },
    ...(c.a || city
      ? { address: { '@type': 'PostalAddress', ...(c.a ? { streetAddress: c.a.split(',')[0] } : {}), ...(city ? { addressLocality: city.n } : {}), addressCountry: 'CZ' } }
      : {}),
    ...(schemaHours(c.o) ? { openingHours: schemaHours(c.o) } : {}),
    ...(c.p ? { telephone: c.p } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  const crumbs = [['Kafemapa', '/']];
  if (city && cityHasPage) crumbs.push(['Kavárny podle měst', '/kavarny/'], [city.n, `/kavarny/${city.slug}/`]);
  crumbs.push([c.n, path]);

  const actions = [`<a class="btn primary" href="https://mapy.com/fnc/v1/route?end=${c.x},${c.y}" rel="noopener">Navigovat</a>`];
  actions.push(`<a class="btn" href="/#${c.i}">Na mapě</a>`);
  if (c.w) actions.push(`<a class="btn" href="${esc(c.w)}" rel="noopener nofollow">Web</a>`);
  if (c.p) actions.push(`<a class="btn" href="tel:${esc(c.p.replace(/[^\d+]/g, ''))}">${esc(c.p)}</a>`);
  if (c.ig) actions.push(`<a class="btn" href="${esc(c.ig)}" rel="noopener nofollow">Instagram</a>`);
  if (c.fb) actions.push(`<a class="btn" href="${esc(c.fb)}" rel="noopener nofollow">Facebook</a>`);

  let hours;
  if (week) {
    hours = `<table class="week" data-week>
          <tbody>${DAY_LONG.map((d, i) => {
            const iv = week[i];
            const txt = !iv.length ? 'zavřeno' : iv.map(([a, b]) => (a === 0 && b >= 1440 ? 'nonstop' : `${fmtMin(a)}–${fmtMin(b)}`)).join(', ');
            return `<tr data-day="${i}"><th scope="row">${d}</th><td>${txt}</td></tr>`;
          }).join('')}</tbody>
        </table>
        <p class="small muted">Svátky a výjimky nezohledňujeme. Před cestou je raději ověřte.</p>`;
  } else if (c.o) {
    hours = `<p class="cafe-hours raw">${esc(c.o)}</p>`;
  } else {
    hours = `<p class="muted">Otevírací doba zatím v OpenStreetMap chybí. Znáte ji? <a href="${osmUrl(c, true)}" rel="noopener">Doplňte ji</a> a objeví se tady.</p>`;
  }

  return (
    head({ title, description, path, jsonLd: [breadcrumbLd(crumbs), business] }) +
    `
  <main class="page-main cafe-page">
    <nav class="crumbs" aria-label="Drobečková navigace">${crumbs
      .map(([n, p], i) => (i === crumbs.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${p}">${esc(n)}</a>`))
      .join(' › ')}</nav>
    <p class="eyebrow">${kind}</p>
    <h1>${esc(c.n)}</h1>
    ${addr ? `<p class="lead">${esc(addr)}</p>` : ''}
    <div class="cafe-live" data-live${c.o ? ` data-o="${esc(c.o)}"` : ''}><span class="status" data-status></span></div>

    <div class="actions">${actions.join('\n      ')}</div>

    ${c.d ? `<section><h2>Popis</h2><p>${esc(c.d)}</p></section>` : ''}

    <section>
      <h2>Otevírací doba</h2>
        ${hours}
    </section>

    ${feats.length ? `<section><h2>Vybavení</h2><div class="tags">${feats.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>` : ''}

    ${nearby.length ? `<section>
      <h2>Další kavárny v okolí</h2>
      <ul class="near">
        ${nearby.map(({ n, d }) => `<li><a href="${n.path}">${esc(n.c.n)}</a> <span class="muted">${fmtDist(d)}${n.c.a ? ` · ${esc(n.c.a.split(',')[0])}` : ''}</span></li>`).join('\n        ')}
      </ul>
      ${city && cityHasPage ? `<p><a href="/kavarny/${city.slug}/">Všechny kavárny: ${esc(city.n)}</a></p>` : ''}
    </section>` : ''}

    <p class="small muted osm-note">Údaje pocházejí z <a href="${osmUrl(c)}" rel="noopener">OpenStreetMap</a>. Je tu chyba nebo něco chybí? <a href="${osmUrl(c, true)}" rel="noopener">Upravte to v OSM</a>, oprava se tu objeví do týdne.</p>
  </main>
  <script type="module" src="/assets/pages.js"></script>` +
    foot(meta)
  );
}

export async function buildCafes(outDir, data) {
  const asOf = new Date(data.osmBase || data.generated);

  const pages = [];
  for (const c of data.cafes) {
    const city = c.c != null ? data.cities[c.c] : null;
    const path = cafePath(c, city?.n);
    if (path) pages.push({ c, city, path });
  }

  // Sousedé: jednoduchá mřížka po ~0,05°, aby se nepočítaly všechny dvojice.
  const cell = (y, x) => `${Math.floor(y / 0.05)}:${Math.floor(x / 0.05)}`;
  const grid = new Map();
  for (const p of pages) {
    const k = cell(p.c.y, p.c.x);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const neighbours = (p) => {
    const gy = Math.floor(p.c.y / 0.05), gx = Math.floor(p.c.x / 0.05);
    const cand = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cand.push(...(grid.get(`${gy + dy}:${gx + dx}`) || []));
    return cand
      .filter((n) => n !== p)
      .map((n) => ({ n, d: km(p.c, n.c) }))
      .filter((x) => x.d <= 5)
      .sort((a, b) => a.d - b.d || a.n.c.n.localeCompare(b.n.c.n, 'cs'))
      .slice(0, NEARBY);
  };

  for (const p of pages) {
    const dir = join(outDir, p.path);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'index.html'),
      cafePage(p.c, {
        city: p.city,
        path: p.path,
        week: parseHours(p.c.o, asOf),
        nearby: neighbours(p),
        meta: data,
      })
    );
  }
  return { urls: pages.map((p) => p.path), pathById: new Map(pages.map((p) => [p.c.i, p.path])) };
}
