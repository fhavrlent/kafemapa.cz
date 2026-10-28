// Generuje statické stránky měst (/kavarny/<mesto>/), jejich rozcestník (/kavarny/)
// a sitemap.xml. Volá ho scripts/build.mjs; data bere z data/cafes.json.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHours, formatWeek } from '../assets/hours.js';

export const SITE = 'https://kafemapa.cz';
export const MIN_CAFES = 5; // menší města by měla příliš tenký obsah

// Bitové příznaky — musí odpovídat scripts/fetch-data.mjs
const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };

export { slugify } from '../assets/slug.js';
import { slugify, cityNameIn } from '../assets/slug.js';

// /en/cities/<slug>/: anglické jméno, kde existuje (Prague), jinak stejný slug jako česky.
export const cityEnSlug = (city) => (cityNameIn(city.n, 'en') !== city.n ? slugify(cityNameIn(city.n, 'en')) : city.slug);
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const plural = (n, [one, few, many]) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
export const num = (n) => n.toLocaleString('cs-CZ');
export const dec = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const collator = new Intl.Collator('cs');

function km(a, b) {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLon = ((b.x - a.x) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.y * Math.PI) / 180) * Math.cos((b.y * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------- společné části stránky ---------------- */

const NAV = {
  cs: { home: '/', label: 'Hlavní', logo: 'Kafemapa — mapa kaváren', links: [['/', 'Mapa'], ['/kavarny/', 'Města'], ['/nove/', 'Nově'], ['/doplnit/', 'Doplnit'], ['/kavarensky-index/', 'Index']], other: ['en', 'English'] },
  en: { home: '/en/', label: 'Main', logo: 'Kafemapa — café map', links: [['/en/', 'Map'], ['/en/cities/', 'Towns'], ['/en/help/', 'Help']], other: ['cs', 'Česky'] },
};

/**
 * Hlavička stránky. `alternates` = { cs: '/kavarny/brno/', en: '/en/cities/brno/' } → hreflang a přepínač jazyka.
 */
export function head({ title, description, path, jsonLd, image = '/og-image.png', extraCss = '', lang = 'cs', alternates = null }) {
  const nav = NAV[lang];
  const [otherLang, otherLabel] = nav.other;
  const otherPath = alternates?.[otherLang] || NAV[otherLang].home;
  const hreflang = alternates
    ? Object.entries(alternates).map(([l, p]) => `  <link rel="alternate" hreflang="${l}" href="${SITE}${p}">\n`).join('') +
      (alternates.cs ? `  <link rel="alternate" hreflang="x-default" href="${SITE}${alternates.cs}">\n` : '')
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${path}">
${hreflang}  <meta name="theme-color" content="#f6efe6" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1b1411" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}${path}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}${image}">
  <meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'cs_CZ'}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/fonts/fonts.css">
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="stylesheet" href="/assets/pages.css">
${extraCss}  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "0e1d42365ab846fdb996803ff6628e9a"}'></script>
</head>
<body class="page">
  <header class="site-head">
    <a href="${nav.home}" class="logo" aria-label="${nav.logo}">
      <svg viewBox="0 0 40 40" aria-hidden="true" class="logo-mark"><use href="/favicon.svg#mark"/></svg>
      <span>kafe<b>mapa</b></span>
    </a>
    <nav class="site-nav" aria-label="${nav.label}">
      ${nav.links.map(([h, l]) => `<a href="${h}">${l}</a>`).join('\n      ')}
      <a href="${otherPath}" lang="${otherLang}" hreflang="${otherLang}" class="lang-link">${otherLabel}</a>
    </nav>
  </header>
`;
}

export function foot(meta, lang = 'cs') {
  const when = new Date(meta.osmBase || meta.generated).toLocaleDateString(lang === 'en' ? 'en-GB' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  if (lang === 'en') {
    return `
  <footer class="site-foot">
    <p>Data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a> (ODbL), updated <time data-upd>${esc(when)}</time>.
    Missing café or wrong data? Anyone can fix it directly on OpenStreetMap.</p>
    <p><a href="/en/">Kafemapa</a> · <a href="/en/cities/">Cafés by town</a> · <a href="/en/help/">Help improve the data</a> · <a href="/en/about/">About</a> · <a href="/en/privacy/">Privacy</a> · <a href="/" lang="cs">Česky</a></p>
  </footer>
</body>
</html>
`;
  }
  return `
  <footer class="site-foot">
    <p>Data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">přispěvatelé OpenStreetMap</a> (ODbL), aktualizace <time data-upd>${esc(when)}</time>.
    Chybí kavárna nebo je údaj špatně? Opravit ho může kdokoli přímo v OpenStreetMap.</p>
    <p><a href="/">Kafemapa</a> · <a href="/kavarny/">Kavárny podle měst</a> · <a href="/kavarensky-index/">Kavárenský index</a> · <a href="/doplnit/">Pomozte doplnit data</a> · <a href="/o-projektu/">O projektu</a> · <a href="/ochrana-soukromi/">Ochrana soukromí</a> · <a href="/en/" lang="en">English</a></p>
  </footer>
</body>
</html>
`;
}

export const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
});

/* ---------------- stránka města ---------------- */

let cafeLinks = new Map(); // id → /kavarna/…/, nastavuje buildPages

/**
 * Lepivá navigace po sekcích dlouhé stránky města (seznam míst bývá stovky karet).
 * @param {string[][]} links dvojice [kotva, popisek]
 * @param {string} label
 */
export const pageNav = (links, label) =>
  `<nav class="page-nav" aria-label="${label}">${links.map(([id, text]) => `<a href="#${id}">${text}</a>`).join('')}</nav>`;

/** Hledání v seznamu míst; bez JavaScriptu zůstane skryté jako filtry. */
export const listSearch = (placeholder) =>
  `<input type="search" class="list-search" data-search hidden placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off">`;

function cafeItem(c) {
  const href = cafeLinks.get(c.i) || `/#${c.i}`;
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
        <h3><a href="${href}">${esc(c.n)}</a></h3>
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
      alternates: { cs: path, en: `/en/cities/${cityEnSlug(city)}/` },
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

    ${pageNav(
      [
        ['mista', `Všechna místa (${num(n)})`],
        ...(sorted.some((c) => !c.o) ? [['chybi', `Chybí otevírací doba (${num(sorted.filter((c) => !c.o).length)})`]] : []),
        ['okoli', 'Okolní města'],
      ],
      'Části stránky'
    )}

    <section id="mista" aria-labelledby="list-h">
      <h2 id="list-h">Všechna místa s kávou</h2>
      ${listSearch('Hledat podle názvu nebo adresy…')}
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

    ${(() => {
      const missing = sorted.filter((c) => !c.o);
      if (!missing.length) return '';
      return `<section id="chybi" aria-labelledby="missing-h">
      <h2 id="missing-h">Chybí otevírací doba (${num(missing.length)})</h2>
      <p>U těchto míst zatím otevírací dobu nikdo nezapsal. Znáte některé? Na jejich stránce ji doplníte za minutu. <a href="/doplnit/">Jak pomoct</a></p>
      <details class="missing-list">
        <summary>Zobrazit ${num(missing.length)} ${plural(missing.length, ['místo', 'místa', 'míst'])}</summary>
        <ul class="city-links">
          ${missing.map((c) => `<li><a href="${cafeLinks.get(c.i) || `/#${c.i}`}">${esc(c.n)}</a></li>`).join('\n          ')}
        </ul>
      </details>
    </section>

`;
    })()}    <section id="okoli" aria-labelledby="near-h">
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

function contributePage(pages, data) {
  const all = data.cafes;
  const withHours = all.filter((c) => c.o).length;
  const share = withHours / all.length;
  const rows = pages
    .map((p) => {
      const missing = p.cafes.filter((c) => !c.o).length;
      return { p, missing, done: 1 - missing / p.cafes.length };
    })
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.done - b.done)
    .slice(0, 25);
  const pct = (x) => `${Math.round(x * 100)}\u00a0%`;

  return (
    head({
      title: 'Pomozte doplnit kavárny | Kafemapa',
      description: `U ${num(all.length - withHours)} kaváren v Česku chybí otevírací doba. Doplníte ji za minutu přímo do OpenStreetMap a pomůžete všem mapám, které z něj čerpají.`,
      path: '/doplnit/',
      jsonLd: breadcrumbLd([['Kafemapa', '/'], ['Pomozte doplnit data', '/doplnit/']]),
      alternates: { cs: '/doplnit/', en: '/en/help/' },
    }) +
    `
  <main class="page-main report">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <span>Pomozte doplnit data</span></nav>
    <h1>Pomozte doplnit kavárny</h1>
    <p class="lead">Otevírací dobu zná Kafemapa u ${pct(share)} míst. U zbylých ${num(all.length - withHours)} nevíme, kdy mají otevřeno, takže je neumíme ukázat ve filtru „Otevřeno teď“. Data bereme z OpenStreetMap, otevřené mapy, kterou tvoří dobrovolníci. Co doplníte tam, se objeví na Kafemapě i ve všech dalších mapách a aplikacích, které z OSM čerpají.</p>

    <section>
      <h2>Jak na to</h2>
      <ol class="steps">
        <li><strong>Najděte kavárnu</strong> na <a href="/">mapě</a> nebo v seznamu města níže.</li>
        <li><strong>Otevřete „Znáte otevírací dobu?“</strong> a vyplňte časy po dnech. Kafemapa z nich složí správný zápis pro OpenStreetMap.</li>
        <li><strong>Vložte ho v editoru OSM a uložte.</strong> Stačí bezplatný účet na openstreetmap.org. Změna se na Kafemapě objeví do druhého dne.</li>
      </ol>
      <aside class="cta">
        <h3>Jediné pravidlo</h3>
        <p>Zapisujte jen to, co víte sami: z návštěvy, z cedule na dveřích nebo z webu a sociálních sítí kavárny. <strong>Nepřebírejte údaje z Google Map ani jiných map</strong>, jejich licence to nedovoluje a OpenStreetMap by takové změny musel smazat.</p>
      </aside>
      <p>Jste právě v kavárně? Aplikace <a href="https://streetcomplete.app/" rel="noopener">StreetComplete</a> (Android) se na chybějící údaje včetně otevírací doby ptá přímo na místě. V aplikaci <a href="https://every-door.app/" rel="noopener">Every Door</a> (Android i iPhone) upravíte kavárny a obchody v OpenStreetMap z telefonu.</p>
    </section>

    <section>
      <h2>Kde chybí nejvíc</h2>
      <p>Města s nejvíce místy bez otevírací doby. Kliknutím otevřete seznam chybějících míst.</p>
      <figure class="chart">
        <figcaption><strong>Podíl míst s otevírací dobou</strong><span>Seřazeno podle počtu chybějících</span></figcaption>
        <table class="bars">
          <thead class="sr-only"><tr><th scope="col">Město</th><th scope="col">Úplnost</th></tr></thead>
          <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <th scope="row"><a href="/kavarny/${r.p.city.slug}/#chybi">${esc(r.p.city.n)}</a><span class="note">chybí ${num(r.missing)} z ${num(r.p.cafes.length)}</span></th>
            <td><div class="bw"><span class="bar" style="--w:${(r.done * 100).toFixed(1)}%"></span><span class="v">${pct(r.done)}</span></div></td>
          </tr>`
            )
            .join('\n          ')}
          </tbody>
        </table>
      </figure>
      <p class="small muted">Celý seznam měst je v <a href="/kavarny/">přehledu měst</a>, každé město má dole sekci „Chybí otevírací doba“.</p>
    </section>
  </main>` +
    foot(data)
  );
}

// O projektu (/o-projektu/, /en/about/): delší text, který dřív visel v dialogu na mapě.
const ABOUT = {
  cs: {
    path: '/o-projektu/', other: '/en/about/', title: 'O projektu | Kafemapa', h1: 'O Kafemapě', crumb: 'O projektu',
    description: 'Kafemapa ukazuje všechny kavárny, pražírny a obchody s kávou v Česku z otevřených dat OpenStreetMap. Jak funguje a jak pomoct.',
    body: (when) => `
    <p class="lead">Kafemapa ukazuje kavárny, pražírny a obchody s kávou z celého Česka. Nejde o placený katalog ani žebříček „nejlepších“. Je tu každé místo, které někdo zapsal do <a href="https://www.openstreetmap.org/" rel="noopener">OpenStreetMap</a>, otevřené mapy, kterou tvoří dobrovolníci.</p>
    <section>
      <h2>Chybí kavárna, nebo je tu chyba?</h2>
      <p>U třetiny kaváren zatím chybí otevírací doba. <a href="/doplnit/">Pomozte ji doplnit</a>, u každé kavárny k tomu najdete jednoduchý formulář. Zavřený podnik nahlásíte přes „Zavřeno nebo je tu chyba?“ na jeho stránce. Chybějící kavárnu přidáte v <a href="https://www.openstreetmap.org/edit" rel="noopener">editoru OpenStreetMap</a> jako <em>Kavárna</em>.</p>
    </section>
    <section>
      <h2>Jak to funguje</h2>
      <ul>
        <li>Údaje se každý den stahují z OpenStreetMap. Poslední aktualizace: ${when}. Co se změnilo, ukazuje <a href="/nove/">Nově na mapě</a>.</li>
        <li>„Otevřeno teď“ se počítá z tagu <code>opening_hours</code> podle času ve vašem zařízení. Svátky ani výjimky nezohledňujeme, takže před cestou raději ověřte.</li>
        <li>Města se přiřazují podle vzdálenosti od centra, žebříčky jsou proto orientační.</li>
        <li>Dvakrát do roka z dat vychází <a href="/kavarensky-index/">Kavárenský index</a>.</li>
      </ul>
    </section>
    <section>
      <h2>Soukromí</h2>
      <p>Návštěvnost měříme anonymně a bez cookies (Cloudflare Web Analytics), žádné osobní údaje neukládáme. Kafemapa sama cookies nepoužívá; poskytovatel mapových dlaždic Mapy.com nastavuje technickou cookie pro rozložení zátěže svých serverů. Podrobnosti najdete v <a href="/ochrana-soukromi/">informacích o ochraně soukromí</a>.</p>
    </section>
    <section>
      <h2>Zdroje a licence</h2>
      <p>Mapová data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">přispěvatelé OpenStreetMap</a> (ODbL). Podkladová mapa © <a href="https://mapy.com/" rel="noopener">Seznam.cz a.s. (Mapy.com)</a> a další. Počty obyvatel měst: <a href="https://data.csu.gov.cz/datastat/info/SADA/OBY02A" rel="noopener">Český statistický úřad</a>. Kontakt: <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>.</p>
    </section>`,
  },
  en: {
    path: '/en/about/', other: '/o-projektu/', title: 'About | Kafemapa', h1: 'About Kafemapa', crumb: 'About',
    description: 'Kafemapa shows every café, coffee roaster and coffee shop in Czechia from open OpenStreetMap data. How it works and how to help.',
    body: (when) => `
    <p class="lead">Kafemapa shows cafés, coffee roasters and coffee shops all over Czechia. It is not a paid directory or a “best of” list: it includes every place that someone has added to <a href="https://www.openstreetmap.org/" rel="noopener">OpenStreetMap</a>, the open map built by volunteers.</p>
    <section>
      <h2>Missing café or wrong data?</h2>
      <p>A third of cafés have no opening hours yet. <a href="/en/help/">Help add them</a> — every café page has a simple form for it. Report a closed café with “Closed or something wrong?” on its page. Add a missing café in the <a href="https://www.openstreetmap.org/edit" rel="noopener">OpenStreetMap editor</a> as a <em>Cafe</em>.</p>
    </section>
    <section>
      <h2>How it works</h2>
      <ul>
        <li>Data is downloaded from OpenStreetMap every day. Last update: ${when}.</li>
        <li>“Open now” is calculated from the <code>opening_hours</code> tag using your device's clock. Public holidays and exceptions are not included, so check before you go.</li>
        <li>Cafés are assigned to the nearest town, so the town rankings are approximate.</li>
      </ul>
    </section>
    <section>
      <h2>Privacy</h2>
      <p>Visits are measured anonymously and without cookies (Cloudflare Web Analytics); no personal data is stored. Kafemapa itself uses no cookies; the map tile provider Mapy.com sets a technical cookie to balance load across its servers. See the <a href="/en/privacy/">privacy notice</a> for details.</p>
    </section>
    <section>
      <h2>Sources and licences</h2>
      <p>Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a> (ODbL). Base map © <a href="https://mapy.com/" rel="noopener">Seznam.cz a.s. (Mapy.com)</a> and others. Town populations: <a href="https://data.csu.gov.cz/datastat/info/SADA/OBY02A" rel="noopener">Czech Statistical Office</a>. Contact: <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>.</p>
    </section>`,
  },
};

// Informace o zpracování osobních údajů (čl. 13 GDPR): /ochrana-soukromi/, /en/privacy/.
// Popisuje skutečný stav webu: žádné vlastní cookies, písma hostovaná u nás, Cloudflare,
// Mapy.com, OSM poznámky a e-mail. Při změně služeb je potřeba text upravit.
const PRIVACY = {
  cs: {
    path: '/ochrana-soukromi/', title: 'Ochrana soukromí | Kafemapa', h1: 'Ochrana soukromí', crumb: 'Ochrana soukromí',
    description: 'Jak Kafemapa zachází s osobními údaji: bez vlastních cookies, anonymní měření návštěvnosti, kdo údaje zpracovává a jaká máte práva.',
    body: `
    <p class="lead">Kafemapa sbírá co nejméně údajů. Nemáme uživatelské účty, nepoužíváme vlastní cookies ani reklamní sledování. Tady je přehled toho, co se při návštěvě webu přesto děje.</p>
    <section>
      <h2>Kdo za web odpovídá</h2>
      <p>Správcem osobních údajů je Filip Havrlent, provozovatel webu kafemapa.cz. Kontakt: <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>.</p>
    </section>
    <section>
      <h2>Jaké údaje zpracováváme a proč</h2>
      <ul>
        <li><strong>Technické údaje při návštěvě</strong> (IP adresa, typ prohlížeče, navštívená stránka): web běží na infrastruktuře Cloudflare, která je zpracovává kvůli doručení stránek a ochraně před útoky a roboty. Právním základem je náš oprávněný zájem na provozu a zabezpečení webu.</li>
        <li><strong>Měření návštěvnosti</strong>: Cloudflare Web Analytics počítá návštěvy souhrnně a bez cookies, neukládá nic do vašeho prohlížeče a nevytváří profily. Oprávněný zájem: vědět, které části webu lidé používají.</li>
        <li><strong>E-maily</strong>, které nám pošlete na info@kafemapa.cz: použijeme je jen k odpovědi. Oprávněný zájem: vyřídit vaši zprávu.</li>
        <li><strong>Hlášení chyby nebo zavřeného podniku</strong>: text, který napíšete do formuláře, se odešle jako veřejná poznámka do OpenStreetMap, anonymně a bez vašeho jména. Odesíláte ho sami a víte, že bude veřejný.</li>
      </ul>
    </section>
    <section>
      <h2>Komu se údaje dostanou</h2>
      <ul>
        <li><strong>Cloudflare, Inc.</strong> (hosting, zabezpečení, měření návštěvnosti). Firma sídlí v USA a je certifikovaná v rámci EU–US Data Privacy Framework.</li>
        <li><strong>Seznam.cz, a.s.</strong> (podkladová mapa Mapy.com a e-mailová schránka). Při načítání mapy získá Seznam vaši IP adresu a nastaví technickou cookie pro rozložení zátěže svých serverů.</li>
        <li><strong>OpenStreetMap Foundation</strong>, jen pokud odešlete hlášení (poznámka je pak veřejná na openstreetmap.org).</li>
      </ul>
      <p>Písma i data kaváren načítáme z vlastního webu, ne od třetích stran. Údaje nikomu neprodáváme a nepoužíváme je k reklamě.</p>
    </section>
    <section>
      <h2>Cookies a úložiště v prohlížeči</h2>
      <p>Kafemapa sama cookies nepoužívá, proto nemá cookie lištu. V úložišti prohlížeče (localStorage) si pamatujeme jen to, co jste sami udělali: že jste zavřeli upoutávku a které podniky jste už nahlásili, aby se nehlásily dvakrát. Mapy.com nastavuje technickou cookie nutnou pro načtení mapy. Návštěvníkům mimo Česko a Slovensko může Cloudflare po ověření, že nejsou robot, nastavit bezpečnostní cookie.</p>
    </section>
    <section>
      <h2>Jak dlouho údaje uchováváme</h2>
      <p>Technické záznamy uchovává Cloudflare jen po dobu nutnou k provozu a zabezpečení podle svých pravidel. Statistiky návštěvnosti jsou souhrnné a nejde z nich poznat konkrétní osobu. E-maily uchováváme po dobu nezbytnou k vyřízení, nejdéle 2 roky. Poznámky v OpenStreetMap jsou veřejné a spravuje je OpenStreetMap Foundation.</p>
    </section>
    <section>
      <h2>Vaše práva</h2>
      <p>Máte právo na přístup ke svým údajům, jejich opravu nebo výmaz, omezení zpracování a právo vznést námitku proti zpracování založenému na oprávněném zájmu. Stačí napsat na <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>. Stížnost můžete podat u Úřadu pro ochranu osobních údajů (<a href="https://uoou.gov.cz/" rel="noopener">uoou.gov.cz</a>). Nedochází k automatizovanému rozhodování ani profilování.</p>
      <p class="small muted">Platné od 15. října 2026.</p>
    </section>`,
  },
  en: {
    path: '/en/privacy/', title: 'Privacy | Kafemapa', h1: 'Privacy', crumb: 'Privacy',
    description: 'How Kafemapa handles personal data: no own cookies, anonymous visit statistics, who processes data and what your rights are.',
    body: `
    <p class="lead">Kafemapa collects as little data as possible. There are no user accounts, no own cookies and no ad tracking. Here is what still happens when you visit the site.</p>
    <section>
      <h2>Who is responsible</h2>
      <p>The data controller is Filip Havrlent, operator of kafemapa.cz. Contact: <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>.</p>
    </section>
    <section>
      <h2>What data we process and why</h2>
      <ul>
        <li><strong>Technical data when you visit</strong> (IP address, browser type, page visited): the site runs on Cloudflare infrastructure, which processes it to deliver pages and protect against attacks and bots. Legal basis: our legitimate interest in running and securing the site.</li>
        <li><strong>Visit statistics</strong>: Cloudflare Web Analytics counts visits in aggregate and without cookies; it stores nothing in your browser and builds no profiles. Legitimate interest: knowing which parts of the site people use.</li>
        <li><strong>Emails</strong> you send to info@kafemapa.cz: used only to reply. Legitimate interest: answering your message.</li>
        <li><strong>Reports of errors or closed places</strong>: what you type into the form is sent as a public note to OpenStreetMap, anonymously and without your name. You submit it yourself, knowing it will be public.</li>
      </ul>
    </section>
    <section>
      <h2>Who receives data</h2>
      <ul>
        <li><strong>Cloudflare, Inc.</strong> (hosting, security, visit statistics). Based in the USA and certified under the EU–US Data Privacy Framework.</li>
        <li><strong>Seznam.cz, a.s.</strong> (Mapy.com base map and our email inbox). When the map loads, Seznam receives your IP address and sets a technical cookie to balance load across its servers.</li>
        <li><strong>OpenStreetMap Foundation</strong>, only if you submit a report (the note is then public on openstreetmap.org).</li>
      </ul>
      <p>Fonts and café data are served from our own site, not from third parties. We do not sell data or use it for advertising.</p>
    </section>
    <section>
      <h2>Cookies and browser storage</h2>
      <p>Kafemapa itself uses no cookies, which is why there is no cookie banner. In your browser's storage (localStorage) we only remember what you did yourself: that you closed a banner and which places you already reported, so they are not reported twice. Mapy.com sets a technical cookie needed to load the map. For visitors outside Czechia and Slovakia, Cloudflare may set a security cookie after checking they are not a bot.</p>
    </section>
    <section>
      <h2>How long we keep data</h2>
      <p>Cloudflare keeps technical records only as long as needed for operation and security under its own policies. Visit statistics are aggregated and cannot identify individuals. Emails are kept as long as needed to deal with them, at most 2 years. Notes on OpenStreetMap are public and managed by the OpenStreetMap Foundation.</p>
    </section>
    <section>
      <h2>Your rights</h2>
      <p>You have the right to access, correct or erase your data, to restrict processing and to object to processing based on legitimate interest. Just write to <a href="mailto:info@kafemapa.cz">info@kafemapa.cz</a>. You can complain to the Czech data protection authority, Úřad pro ochranu osobních údajů (<a href="https://uoou.gov.cz/" rel="noopener">uoou.gov.cz</a>). There is no automated decision-making or profiling.</p>
      <p class="small muted">Effective from 15 October 2026.</p>
    </section>`,
  },
};

function privacyPage(lang, meta) {
  const P = PRIVACY[lang];
  const home = lang === 'en' ? '/en/' : '/';
  return (
    head({
      lang, title: P.title, description: P.description, path: P.path,
      alternates: { cs: PRIVACY.cs.path, en: PRIVACY.en.path },
      jsonLd: breadcrumbLd([['Kafemapa', home], [P.crumb, P.path]]),
    }) +
    `
  <main class="page-main report">
    <nav class="crumbs" aria-label="${lang === 'en' ? 'Breadcrumb' : 'Drobečková navigace'}"><a href="${home}">Kafemapa</a> › <span>${P.crumb}</span></nav>
    <h1>${P.h1}</h1>
    ${P.body}
  </main>` +
    foot(meta, lang)
  );
}

function aboutPage(lang, meta) {
  const A = ABOUT[lang];
  const when = new Date(meta.osmBase || meta.generated).toLocaleDateString(lang === 'en' ? 'en-GB' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const home = lang === 'en' ? '/en/' : '/';
  return (
    head({
      lang, title: A.title, description: A.description, path: A.path,
      alternates: { cs: ABOUT.cs.path, en: ABOUT.en.path },
      jsonLd: breadcrumbLd([['Kafemapa', home], [A.crumb, A.path]]),
    }) +
    `
  <main class="page-main report">
    <nav class="crumbs" aria-label="${lang === 'en' ? 'Breadcrumb' : 'Drobečková navigace'}"><a href="${home}">Kafemapa</a> › <span>${A.crumb}</span></nav>
    <h1>${A.h1}</h1>
    ${A.body(`<time data-upd>${esc(when)}</time>`)}
  </main>` +
    foot(meta, lang)
  );
}

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
      alternates: { cs: '/kavarny/', en: '/en/cities/' },
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

// Stránku má město s aspoň MIN_CAFES místy; nastaví city.slug (shodná jména → -2, -3…).
// Volá se před ostatními částmi buildu, aby odkazy na města znaly svou adresu.
export function assignCitySlugs(data) {
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
  return pages;
}

export async function buildPages(outDir, data, { extraUrls = [], cafePaths = new Map() } = {}) {
  const pages = assignCitySlugs(data);
  cafeLinks = cafePaths;

  const ranked = data.cities.filter((c) => c.pop >= 10000).sort((a, b) => b.count / b.pop - a.count / a.pop);
  const rankPerCapita = new Map(ranked.map((c, i) => [c, { pos: i + 1, of: ranked.length }]));

  for (const p of pages) {
    const dir = join(outDir, 'kavarny', p.city.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), cityPage(p.city, { cafes: p.cafes, pages, rankPerCapita, meta: data }));
  }
  await writeFile(join(outDir, 'kavarny', 'index.html'), indexPage(pages, data, data.cafes.length));
  for (const lang of ['cs', 'en']) {
    await mkdir(join(outDir, ABOUT[lang].path), { recursive: true });
    await writeFile(join(outDir, ABOUT[lang].path, 'index.html'), aboutPage(lang, data));
    await mkdir(join(outDir, PRIVACY[lang].path), { recursive: true });
    await writeFile(join(outDir, PRIVACY[lang].path, 'index.html'), privacyPage(lang, data));
  }
  await mkdir(join(outDir, 'doplnit'), { recursive: true });
  await writeFile(join(outDir, 'doplnit', 'index.html'), contributePage(pages, data));

  // Slugy měst pro odkaz /?mesto=… z mapy
  await writeFile(
    join(outDir, 'data', 'mesta.json'),
    JSON.stringify(Object.fromEntries(pages.flatMap((p) => [[p.city.slug, data.cities.indexOf(p.city)], [cityEnSlug(p.city), data.cities.indexOf(p.city)]])))
  );

  const lastmod = (data.osmBase || data.generated).slice(0, 10);
  const FRESH = new Set(['/', '/en/', '/nove/']);
  const urls = ['/', '/kavarny/', '/doplnit/', '/o-projektu/', '/en/about/', '/ochrana-soukromi/', '/en/privacy/', ...extraUrls, ...pages.map((p) => `/kavarny/${p.city.slug}/`)];
  await writeFile(
    join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      // lastmod jen tam, kde se stránka s daty opravdu mění; datum aktualizace u všech by
      // vyhledávače naučilo sitemapě nevěřit (data se stahují denně, většina stránek se nemění).
      urls.map((u) => `  <url><loc>${SITE}${u}</loc>${FRESH.has(u) ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n') +
      `\n</urlset>\n`
  );
  return pages.length;
}
