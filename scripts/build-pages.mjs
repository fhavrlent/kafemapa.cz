// Generuje statické stránky měst (/kavarny/<mesto>/), jejich rozcestník (/kavarny/)
// a sitemap.xml. Volá ho scripts/build.mjs; data bere z data/cafes.json.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';

export const SITE = 'https://kafemapa.cz';
export const MIN_CAFES = 5; // menší města by měla příliš tenký obsah

// Bitové příznaky — musí odpovídat scripts/fetch-data.mjs
const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };

export const slugify = (s) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const plural = (n, [one, few, many]) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const num = (n) => n.toLocaleString('cs-CZ');
const dec = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const collator = new Intl.Collator('cs');

function km(a, b) {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLon = ((b.x - a.x) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.y * Math.PI) / 180) * Math.cos((b.y * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------- společné části stránky ---------------- */

function head({ title, description, path, jsonLd }) {
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${path}">
  <meta name="theme-color" content="#f6efe6" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1b1411" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}${path}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta property="og:locale" content="cs_CZ">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="stylesheet" href="/assets/pages.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body class="page">
  <header class="site-head">
    <a href="/" class="logo" aria-label="Kafemapa — mapa kaváren">
      <svg viewBox="0 0 40 40" aria-hidden="true" class="logo-mark"><use href="/favicon.svg#mark"/></svg>
      <span>kafe<b>mapa</b></span>
    </a>
    <nav class="site-nav" aria-label="Hlavní">
      <a href="/">Mapa</a>
      <a href="/kavarny/">Města</a>
    </nav>
  </header>
`;
}

function foot(meta) {
  const when = new Date(meta.osmBase || meta.generated).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
  <footer class="site-foot">
    <p>Data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">přispěvatelé OpenStreetMap</a> (ODbL), aktualizace ${esc(when)}.
    Chybí kavárna nebo je údaj špatně? Opravit ho může kdokoli přímo v OpenStreetMap.</p>
    <p><a href="/">Kafemapa</a> · <a href="/kavarny/">Kavárny podle měst</a></p>
  </footer>
</body>
</html>
`;
}

const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
});

/* ---------------- stránka města ---------------- */

function cafeItem(c) {
  const week = parseHours(c.o);
  const hours = week ? formatWeek(week) : c.o ? c.o : null;
  const tags = [];
  if (c.k) tags.push(c.r ? 'Pražírna' : 'Káva na doma');
  else if (c.r) tags.push('Pražírna');
  if (c.f & F.OUTDOOR) tags.push('Zahrádka');
  if (c.f & F.WIFI) tags.push('Wi‑Fi');
  if (c.f & F.WHEELCHAIR) tags.push('Bezbariérové');
  if (c.f & F.VEGAN) tags.push('Vegan');
  else if (c.f & F.VEGETARIAN) tags.push('Vegetariánské');
  if (c.b) tags.push(c.b);
  return `<li class="cafe" data-f="${c.f || 0}"${c.k || c.r ? ' data-beans' : ''}${c.o ? ` data-o="${esc(c.o)}"` : ''}>
      <div class="cafe-top">
        <h3><a href="/#${c.i}">${esc(c.n)}</a></h3>
        <span class="status" data-status></span>
      </div>
      ${c.a ? `<p class="cafe-addr">${esc(c.a)}</p>` : ''}
      <p class="cafe-hours${!week && c.o ? ' raw' : ''}">${hours ? esc(hours) : '<span class="muted">Otevírací doba neuvedena</span>'}</p>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="cafe-links"><a href="/#${c.i}">Na mapě</a>${c.w ? ` · <a href="${esc(c.w)}" rel="noopener nofollow" target="_blank">Web</a>` : ''}</p>
    </li>`;
}

function cityPage(city, ctx) {
  const { cafes, pages, rankPerCapita, meta } = ctx;
  const n = cafes.length;
  const count = (fn) => cafes.filter(fn).length;
  const nCafe = count((c) => !c.k);
  const nBeans = count((c) => c.k || c.r);
  const nHours = count((c) => c.o);
  const nOutdoor = count((c) => c.f & F.OUTDOOR);
  const nWifi = count((c) => c.f & F.WIFI);
  const nIndie = count((c) => !(c.f & F.CHAIN));
  const perCapita = city.pop ? (n / city.pop) * 10000 : null;
  const rank = rankPerCapita.get(city);

  const nearby = pages
    .filter((p) => p.city !== city)
    .map((p) => ({ ...p, d: km(city, p.city) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  const path = `/kavarny/${city.slug}/`;
  const title = `Kavárny ${city.n}: ${num(n)} ${plural(n, ['místo', 'místa', 'míst'])} s kávou | Kafemapa`;
  const description =
    `${num(n)} kaváren, pražíren a obchodů s kávou v okolí města ${city.n}. ` +
    `Otevírací doby, zahrádky, Wi‑Fi a mapa. Co má právě otevřeno?`;

  const intro = [
    `Na Kafemapě je v okolí centra města ${esc(city.n)} ${num(n)} ${plural(n, ['místo', 'místa', 'míst'])} s kávou: ` +
      `${num(nCafe)} ${plural(nCafe, ['kavárna', 'kavárny', 'kaváren'])}` +
      (n - nCafe ? ` a ${num(n - nCafe)} ${plural(n - nCafe, ['obchod s kávou nebo pražírna', 'obchody s kávou a pražírny', 'obchodů s kávou a pražíren'])}` : '') +
      `. ${num(nIndie)} z nich nepatří k žádnému řetězci.`,
    `Otevírací dobu má uvedenou ${num(nHours)} z nich, zahrádku ${num(nOutdoor)} a Wi‑Fi ${num(nWifi)}.` +
      (rank
        ? ` Na 10 000 obyvatel tu připadá ${dec(perCapita)} místa s kávou, což je ${rank.pos}. místo mezi ${rank.of} městy nad 10 000 obyvatel.`
        : ''),
  ];

  const sorted = cafes.slice().sort((a, b) => collator.compare(a.n, b.n));

  return (
    head({
      title,
      description,
      path,
      jsonLd: breadcrumbLd([['Kafemapa', '/'], ['Kavárny podle měst', '/kavarny/'], [city.n, path]]),
    }) +
    `
  <main class="page-main">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <a href="/kavarny/">Města</a> › <span>${esc(city.n)}</span></nav>
    <p class="eyebrow">Kavárny a pražírny</p>
    <h1>${esc(city.n)}</h1>
    ${intro.map((p) => `<p class="lead">${p}</p>`).join('\n    ')}

    <dl class="stats">
      <div><dt>Míst s kávou</dt><dd>${num(n)}</dd></div>
      <div><dt>Se zahrádkou</dt><dd>${num(nOutdoor)}</dd></div>
      <div><dt>Nezávislých</dt><dd>${num(nIndie)}</dd></div>
      ${perCapita != null ? `<div><dt>Na 10 000 obyvatel</dt><dd>${dec(perCapita)}</dd></div>` : ''}
    </dl>

    <p><a class="btn primary map-cta" href="/?mesto=${city.slug}">Zobrazit ${esc(city.n)} na mapě</a></p>

    <section aria-labelledby="list-h">
      <h2 id="list-h">Všechna místa s kávou</h2>
      <div class="chips" role="group" aria-label="Filtry" data-filters hidden>
        <button class="chip" data-filter="open" aria-pressed="false"><i class="dot dot-open"></i>Otevřeno teď</button>
        <button class="chip" data-filter="indie" aria-pressed="false">Nezávislé</button>
        <button class="chip" data-filter="outdoor" aria-pressed="false">Zahrádka</button>
        <button class="chip" data-filter="wifi" aria-pressed="false">Wi‑Fi</button>
        ${nBeans ? '<button class="chip" data-filter="beans" aria-pressed="false">Pražírny a zrnka</button>' : ''}
      </div>
      <p class="muted small" data-count aria-live="polite"></p>
      <ol class="cafes">
    ${sorted.map(cafeItem).join('\n    ')}
      </ol>
      <p class="muted small">Otevírací doby jsou z OpenStreetMap a nezohledňují svátky ani výjimky. Před cestou je raději ověřte.</p>
    </section>

    <section aria-labelledby="near-h">
      <h2 id="near-h">Kavárny v okolních městech</h2>
      <ul class="city-links">
        ${nearby.map((p) => `<li><a href="/kavarny/${p.city.slug}/">${esc(p.city.n)}</a> <span class="muted">${num(p.cafes.length)} · ${Math.round(p.d)} km</span></li>`).join('\n        ')}
      </ul>
    </section>
  </main>
  <script type="module" src="/assets/pages.js"></script>` +
    foot(meta)
  );
}

/* ---------------- rozcestník měst ---------------- */

function indexPage(pages, meta, totalCafes) {
  const top = pages.slice().sort((a, b) => b.cafes.length - a.cafes.length).slice(0, 12);
  const groups = new Map();
  for (const p of pages.slice().sort((a, b) => collator.compare(a.city.n, b.city.n))) {
    const letter = /^ch/i.test(p.city.n) ? 'Ch' : p.city.n[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(p);
  }
  const covered = pages.reduce((s, p) => s + p.cafes.length, 0);

  return (
    head({
      title: 'Kavárny podle měst — kde v Česku na kafe | Kafemapa',
      description: `Kavárny, pražírny a obchody s kávou v ${pages.length} českých městech. Otevírací doby, zahrádky a Wi‑Fi z otevřených dat OpenStreetMap.`,
      path: '/kavarny/',
      jsonLd: breadcrumbLd([['Kafemapa', '/'], ['Kavárny podle měst', '/kavarny/']]),
    }) +
    `
  <main class="page-main">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <span>Města</span></nav>
    <h1>Kavárny podle měst</h1>
    <p class="lead">Kafemapa zná ${num(totalCafes)} kaváren, pražíren a obchodů s kávou v celém Česku. Tady jsou rozdělené do ${pages.length} měst, ve kterých jich je aspoň ${MIN_CAFES} (dohromady ${num(covered)}). Ostatní najdete na <a href="/">mapě</a>.</p>

    <h2>Největší kavárenská města</h2>
    <ol class="top-cities">
      ${top.map((p) => `<li><a href="/kavarny/${p.city.slug}/"><span class="tc-name">${esc(p.city.n)}</span><span class="tc-count">${num(p.cafes.length)}</span></a></li>`).join('\n      ')}
    </ol>

    <h2>Všechna města od A do Ž</h2>
    <nav class="letters" aria-label="Písmena">${[...groups.keys()].map((l) => `<a href="#p-${slugify(l)}">${l}</a>`).join(' ')}</nav>
    ${[...groups]
      .map(
        ([l, ps]) => `<section class="letter" id="p-${slugify(l)}">
      <h3>${l}</h3>
      <ul class="city-links">
        ${ps.map((p) => `<li><a href="/kavarny/${p.city.slug}/">${esc(p.city.n)}</a> <span class="muted">${num(p.cafes.length)}</span></li>`).join('\n        ')}
      </ul>
    </section>`
      )
      .join('\n    ')}
  </main>` +
    foot(meta)
  );
}

/* ---------------- sestavení ---------------- */

export async function buildPages(outDir, data) {
  const byCity = new Map();
  for (const c of data.cafes) {
    if (c.c == null) continue;
    if (!byCity.has(c.c)) byCity.set(c.c, []);
    byCity.get(c.c).push(c);
  }

  const used = new Set();
  const pages = [];
  data.cities.forEach((city, idx) => {
    const cafes = byCity.get(idx) || [];
    if (cafes.length < MIN_CAFES) return;
    let slug = slugify(city.n);
    for (let k = 2; used.has(slug); k++) slug = `${slugify(city.n)}-${k}`;
    used.add(slug);
    city.slug = slug;
    pages.push({ city, cafes });
  });

  const ranked = data.cities.filter((c) => c.pop >= 10000).sort((a, b) => b.count / b.pop - a.count / a.pop);
  const rankPerCapita = new Map(ranked.map((c, i) => [c, { pos: i + 1, of: ranked.length }]));

  for (const p of pages) {
    const dir = join(outDir, 'kavarny', p.city.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), cityPage(p.city, { cafes: p.cafes, pages, rankPerCapita, meta: data }));
  }
  await writeFile(join(outDir, 'kavarny', 'index.html'), indexPage(pages, data, data.cafes.length));

  // Slugy měst pro odkaz /?mesto=… z mapy
  await writeFile(join(outDir, 'data', 'mesta.json'), JSON.stringify(Object.fromEntries(pages.map((p) => [p.city.slug, data.cities.indexOf(p.city)]))));

  const lastmod = (data.osmBase || data.generated).slice(0, 10);
  const urls = ['/', '/kavarny/', ...pages.map((p) => `/kavarny/${p.city.slug}/`)];
  await writeFile(
    join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') +
      `\n</urlset>\n`
  );
  return pages.length;
}
