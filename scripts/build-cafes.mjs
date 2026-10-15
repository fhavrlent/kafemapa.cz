// Stránka pro každou nezávislou kavárnu s dostatkem údajů, česky i anglicky:
//   /kavarna/<jméno>-<město>-<osm id>/  a  /en/cafe/<name>-<town>-<osm id>/
// Kvůli vyhledávání podle jména („Monogram Brno otevírací doba“). Volá ji scripts/build.mjs.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';
import { cafePath, cityNameIn, mapySearchUrl } from '../assets/slug.js';
import { head, foot, esc, breadcrumbLd, SITE, cityEnSlug } from './build-pages.mjs';

const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };
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
const fmtDist = (d, lang) =>
  d < 1 ? `${Math.round(d * 100) * 10} m` : `${lang === 'en' ? d.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : d.toFixed(1).replace('.', ',')} km`;

const T = {
  cs: {
    days: ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'],
    kind: (c) => (c.k ? (c.r ? 'Pražírna' : 'Obchod s kávou') : c.r ? 'Kavárna a pražírna' : 'Kavárna'),
    feats: { outdoor: 'Zahrádka', wifi: 'Wi‑Fi', wheel: 'Bezbariérový vstup', wheelLim: 'Částečně bezbariérové', vegan: 'Veganské možnosti', veg: 'Vegetariánské možnosti', card: 'Platba kartou' },
    home: '/', towns: ['Kavárny podle měst', '/kavarny/'], townPath: (city) => `/kavarny/${city.slug}/`, town: (city) => city?.n,
    title: (n, town) => `${n}${town ? `, ${town}` : ''}: otevírací doba a adresa | Kafemapa`,
    desc: (kind, n, addr) => `${kind} ${n}${addr ? `, ${addr}` : ''}.`, descHours: (h) => `Otevírací doba: ${h}.`,
    crumbs: 'Drobečková navigace', navigate: 'Navigovat', onMap: 'Na mapě', web: 'Web', mapHome: '/', mapy: 'Fotky a recenze na Mapy.com',
    closed: 'zavřeno', nonstop: 'nonstop', holidays: 'Svátky a výjimky nezohledňujeme. Před cestou je raději ověřte.',
    fix: 'Nesedí otevírací doba? Opravte ji', add: 'Znáte otevírací dobu? Pomozte ji doplnit', missing: 'Otevírací doba zatím v OpenStreetMap chybí.',
    description: '<h2>Popis</h2><p>', hours: 'Otevírací doba', amenities: 'Vybavení', nearby: 'Další kavárny v okolí', all: (town) => `Všechny kavárny: ${town}`,
    report: 'Zavřeno nebo je tu chyba? Nahlaste to',
    osm: (view, edit) => `Údaje pocházejí z <a href="${view}" rel="noopener">OpenStreetMap</a>. Je tu chyba nebo něco chybí? <a href="${edit}" rel="noopener">Upravte to v OSM</a>, oprava se tu objeví do týdne.`,
  },
  en: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    kind: (c) => (c.k ? (c.r ? 'Coffee roaster' : 'Coffee shop') : c.r ? 'Café & roaster' : 'Café'),
    feats: { outdoor: 'Outdoor seating', wifi: 'Wi‑Fi', wheel: 'Wheelchair accessible', wheelLim: 'Partly wheelchair accessible', vegan: 'Vegan options', veg: 'Vegetarian options', card: 'Cards accepted' },
    home: '/en/', towns: ['Cafés by town', '/en/cities/'], townPath: (city) => `/en/cities/${cityEnSlug(city)}/`, town: (city) => cityNameIn(city?.n, 'en'),
    title: (n, town) => `${n}${town ? `, ${town}` : ''}: opening hours & address | Kafemapa`,
    desc: (kind, n, addr) => `${kind} ${n}${addr ? `, ${addr}` : ''}, Czechia.`, descHours: (h) => `Opening hours: ${h}.`,
    crumbs: 'Breadcrumb', navigate: 'Directions', onMap: 'On the map', web: 'Website', mapHome: '/en/', mapy: 'Photos & reviews on Mapy.com',
    closed: 'closed', nonstop: 'open 24/7', holidays: 'Public holidays and exceptions are not included. Please check before you go.',
    fix: 'Hours wrong? Fix them', add: 'Know the opening hours? Add them', missing: 'Opening hours are not in OpenStreetMap yet.',
    description: '<h2>Description <span class="muted small">(in Czech)</span></h2><p lang="cs">', hours: 'Opening hours', amenities: 'Amenities', nearby: 'Other cafés nearby', all: (town) => `All cafés in ${town}`,
    report: 'Closed or something wrong? Report it',
    osm: (view, edit) => `Data from <a href="${view}" rel="noopener">OpenStreetMap</a>. Something wrong or missing? <a href="${edit}" rel="noopener">Edit it on OSM</a> — the fix shows up here within a week.`,
  },
};
const osmUrl = (c, edit) => {
  const type = { n: 'node', w: 'way', r: 'relation' }[c.i[0]];
  return edit ? `https://www.openstreetmap.org/edit?${type}=${c.i.slice(1)}` : `https://www.openstreetmap.org/${type}/${c.i.slice(1)}`;
};

function features(c, L) {
  const f = L.feats;
  const out = [];
  if (c.f & F.OUTDOOR) out.push(f.outdoor);
  if (c.f & F.WIFI) out.push(f.wifi);
  if (c.f & F.WHEELCHAIR) out.push(f.wheel);
  if (c.f & F.WHEELCHAIR_LIMITED) out.push(f.wheelLim);
  if (c.f & F.VEGAN) out.push(f.vegan);
  else if (c.f & F.VEGETARIAN) out.push(f.veg);
  if (c.f & F.CARD) out.push(f.card);
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

// Rozbalovací pomocník pro zápis otevírací doby (assets/hours-editor.js, načte se až po otevření).
const helpBox = (c, label, open = false) => `<details class="help-box"${open ? ' data-primary' : ''}>
          <summary>${label}</summary>
          <div data-hours-editor data-osm-edit="${osmUrl(c, true)}"${c.o ? ` data-current="${esc(c.o)}"` : ''}></div>
        </details>`;

function cafePage(c, ctx, lang = 'cs') {
  const L = T[lang];
  const { city, week, nearby, meta } = ctx;
  const path = cafePath(c, city?.n, lang);
  const cityHasPage = !!city?.slug;
  const town = L.town(city);
  const kind = L.kind(c);
  const addr = [c.a, c.a && city && c.a.includes(city.n) ? null : town].filter(Boolean).join(', ');
  const feats = features(c, L);
  const hoursText = week ? formatWeek(week, lang) : null;

  const title = L.title(c.n, city ? town : null);
  const description = [
    L.desc(kind, c.n, addr),
    hoursText ? L.descHours(hoursText) : null,
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
  const crumbs = [['Kafemapa', L.home]];
  if (city && cityHasPage) crumbs.push(L.towns, [town, L.townPath(city)]);
  crumbs.push([c.n, path]);

  const actions = [`<a class="btn primary" href="https://mapy.com/fnc/v1/route?end=${c.x},${c.y}" rel="noopener">${L.navigate}</a>`];
  actions.push(`<a class="btn" href="${L.mapHome}#${c.i}">${L.onMap}</a>`);
  if (c.w) actions.push(`<a class="btn" href="${esc(c.w)}" rel="noopener nofollow">${L.web}</a>`);
  if (c.p) actions.push(`<a class="btn" href="tel:${esc(c.p.replace(/[^\d+]/g, ''))}">${esc(c.p)}</a>`);
  if (c.ig) actions.push(`<a class="btn" href="${esc(c.ig)}" rel="noopener nofollow">Instagram</a>`);
  if (c.fb) actions.push(`<a class="btn" href="${esc(c.fb)}" rel="noopener nofollow">Facebook</a>`);
  actions.push(`<a class="btn" href="${esc(mapySearchUrl(c, city?.n))}" rel="noopener">${L.mapy}</a>`);

  let hours;
  if (week) {
    hours = `<table class="week" data-week>
          <tbody>${L.days.map((d, i) => {
            const iv = week[i];
            const txt = !iv.length ? L.closed : iv.map(([a, b]) => (a === 0 && b >= 1440 ? L.nonstop : `${fmtMin(a)}–${fmtMin(b)}`)).join(', ');
            return `<tr data-day="${i}"><th scope="row">${d}</th><td>${txt}</td></tr>`;
          }).join('')}</tbody>
        </table>
        <p class="small muted">${L.holidays}</p>
        ${helpBox(c, L.fix)}`;
  } else if (c.o) {
    hours = `<p class="cafe-hours raw">${esc(c.o)}</p>${helpBox(c, L.fix)}`;
  } else {
    hours = `<p class="muted">${L.missing}</p>${helpBox(c, L.add, true)}`;
  }

  return (
    head({ lang, title, description, path, jsonLd: [breadcrumbLd(crumbs), business], alternates: { cs: cafePath(c, city?.n, 'cs'), en: cafePath(c, city?.n, 'en') } }) +
    `
  <main class="page-main cafe-page">
    <nav class="crumbs" aria-label="${L.crumbs}">${crumbs
      .map(([n, p], i) => (i === crumbs.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${p}">${esc(n)}</a>`))
      .join(' › ')}</nav>
    <p class="eyebrow">${kind}</p>
    <h1>${esc(c.n)}</h1>
    ${addr ? `<p class="lead">${esc(addr)}</p>` : ''}
    <div class="cafe-live" data-live${c.o ? ` data-o="${esc(c.o)}"` : ''}><span class="status" data-status></span></div>

    <div class="actions">${actions.join('\n      ')}</div>

    ${c.d ? `<section>${L.description}${esc(c.d)}</p></section>` : ''}

    <section>
      <h2>${L.hours}</h2>
        ${hours}
    </section>

    ${feats.length ? `<section><h2>${L.amenities}</h2><div class="tags">${feats.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>` : ''}

    ${nearby.length ? `<section>
      <h2>${L.nearby}</h2>
      <ul class="near">
        ${nearby.map(({ c: n, d }) => `<li><a href="${cafePath(n, n.c != null ? meta.cities[n.c].n : null, lang)}">${esc(n.n)}</a> <span class="muted">${fmtDist(d, lang)}${n.a ? ` · ${esc(n.a.split(',')[0])}` : ''}</span></li>`).join('\n        ')}
      </ul>
      ${city && cityHasPage ? `<p><a href="${L.townPath(city)}">${esc(L.all(town))}</a></p>` : ''}
    </section>` : ''}

    <details class="help-box report-box">
      <summary>${L.report}</summary>
      <div data-report data-i="${c.i}" data-n="${esc(c.n)}" data-y="${c.y}" data-x="${c.x}"></div>
    </details>

    <p class="small muted osm-note">${L.osm(osmUrl(c), osmUrl(c, true))}</p>
  </main>
  <script type="module" src="/assets/pages.js"></script>` +
    foot(meta, lang)
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

  const enUrls = [];
  for (const p of pages) {
    const ctx = { city: p.city, week: parseHours(p.c.o, asOf), nearby: neighbours(p).map(({ n, d }) => ({ c: n.c, d })), meta: data };
    for (const lang of ['cs', 'en']) {
      const path = cafePath(p.c, p.city?.n, lang);
      await mkdir(join(outDir, path), { recursive: true });
      await writeFile(join(outDir, path, 'index.html'), cafePage(p.c, ctx, lang));
      if (lang === 'en') enUrls.push(path);
    }
  }
  return {
    urls: pages.map((p) => p.path),
    enUrls,
    pathById: new Map(pages.map((p) => [p.c.i, p.path])),
  };
}
