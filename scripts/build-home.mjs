// Statický obsah úvodní stránky (/ i /en/) pro vyhledávače a AI asistenty, kteří nespouštějí
// JavaScript: shrnutí, největší města s odkazy na jejich stránky a další části webu.
// Vkládá se do seznamu #list, který aplikace po načtení dat přepíše skutečným seznamem
// kaváren, takže lidé ho vidí jen na okamžik, než se mapa načte.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { esc, cityEnSlug } from './build-pages.mjs';
import { cityNameIn } from '../assets/slug.js';
import { numIn } from '../assets/i18n.js';

const TOWNS = 24;

const T = {
  cs: {
    intro: (n, d) => `Kafemapa ukazuje ${n} kaváren, pražíren a obchodů s kávou v Česku: co má právě otevřeno, kde je zahrádka, Wi‑Fi nebo bezbariérový vstup. Data pocházejí z OpenStreetMap a aktualizují se každý den (naposledy <time data-upd>${d}</time>).`,
    towns: 'Kavárny podle měst',
    townPath: (c) => `/kavarny/${c.slug}/`,
    all: (n) => `Všech ${n} měst`,
    allPath: '/kavarny/',
    more: 'Dál na Kafemapě',
    links: [
      ['/kavarensky-index/podzim-2026/', 'Kavárenský index: Brno je kavárenštější než Praha'],
      ['/nove/', 'Nově na mapě: nové kavárny a změny každý týden'],
      ['/doplnit/', 'Pomozte doplnit otevírací doby'],
      ['/o-projektu/', 'O projektu'],
    ],
  },
  en: {
    intro: (n, d) => `Kafemapa shows ${n} cafés, coffee roasters and coffee shops in Czechia: what is open right now, with outdoor seating, Wi‑Fi or wheelchair access. The data comes from OpenStreetMap and is updated every day (last on <time data-upd>${d}</time>).`,
    towns: 'Cafés by town',
    townPath: (c) => `/en/cities/${cityEnSlug(c)}/`,
    all: (n) => `All ${n} towns`,
    allPath: '/en/cities/',
    more: 'More on Kafemapa',
    links: [
      ['/kavarensky-index/podzim-2026/', 'Café Index (in Czech): Brno has more cafés per person than Prague'],
      ['/en/help/', 'Help add missing opening hours'],
      ['/en/about/', 'About Kafemapa'],
    ],
  },
};

function homeStatic(data, lang) {
  const L = T[lang];
  const date = new Date(data.osmBase || data.generated).toLocaleDateString(lang === 'en' ? 'en-GB' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const withPage = data.cities.filter((c) => c.slug);
  const towns = [...withPage].sort((a, b) => b.count - a.count).slice(0, TOWNS);
  return `<li class="home-static">
          <p>${L.intro(numIn(lang, data.cafes.length), esc(date))}</p>
          <h2>${L.towns}</h2>
          <ul class="home-towns">${towns.map((c) => `<li><a href="${L.townPath(c)}">${esc(cityNameIn(c.n, lang))}</a> <span>${numIn(lang, c.count)}</span></li>`).join('')}</ul>
          <p><a href="${L.allPath}">${L.all(withPage.length)}&nbsp;→</a></p>
          <h2>${L.more}</h2>
          <ul class="home-links">${L.links.map(([href, text]) => `<li><a href="${href}"${lang === 'en' && !href.startsWith('/en/') ? ' hreflang="cs"' : ''}>${esc(text)}</a></li>`).join('')}</ul>
        </li>`;
}

const EMPTY = '<ol class="list" id="list"></ol>';

export async function buildHome(outDir, data) {
  for (const [lang, file] of [['cs', 'index.html'], ['en', join('en', 'index.html')]]) {
    const path = join(outDir, file);
    const html = await readFile(path, 'utf8');
    if (!html.includes(EMPTY)) throw new Error(`build-home: v ${file} chybí ${EMPTY}`);
    await writeFile(path, html.replace(EMPTY, `<ol class="list" id="list">\n        ${homeStatic(data, lang)}\n        </ol>`));
  }
}
