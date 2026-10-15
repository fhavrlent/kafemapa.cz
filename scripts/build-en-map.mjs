// Anglická mapa /en/ z index.html: stejná aplikace, přeložené texty v HTML.
// Každá náhrada musí v index.html existovat; když se český text změní a překlad
// se zapomene, build spadne, místo aby na /en/ zůstala půlka česky.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PAIRS = [
  ['<html lang="cs">', '<html lang="en">'],
  ['<title>Kafemapa — všechny kavárny v Česku na jedné mapě</title>', '<title>Kafemapa — every café in Czechia on one map</title>'],
  [
    '<meta name="description" content="Přes 4 000 kaváren, pražíren a obchodů s kávou v Česku. Zjistěte, co má právě otevřeno, kde je zahrádka, Wi‑Fi nebo bezbariérový vstup. Otevřená data z OpenStreetMap.">',
    '<meta name="description" content="Over 4,000 cafés, coffee roasters and coffee shops in Czechia — Prague, Brno, Český Krumlov and beyond. See what is open right now, with outdoor seating, Wi‑Fi or wheelchair access. Open data from OpenStreetMap.">',
  ],
  ['<link rel="canonical" href="https://kafemapa.cz/">', '<link rel="canonical" href="https://kafemapa.cz/en/">'],
  ['<meta property="og:url" content="https://kafemapa.cz/">', '<meta property="og:url" content="https://kafemapa.cz/en/">'],
  ['<meta property="og:title" content="Kafemapa — všechny kavárny v Česku na jedné mapě">', '<meta property="og:title" content="Kafemapa — every café in Czechia on one map">'],
  ['<meta property="og:description" content="Kde je teď otevřeno? Kavárny, pražírny a obchody s kávou z celé republiky.">', '<meta property="og:description" content="Where is a café open right now? Cafés, roasters and coffee shops all over Czechia.">'],
  ['<meta property="og:locale" content="cs_CZ">', '<meta property="og:locale" content="en_GB">'],
  ['"inLanguage": "cs",', '"inLanguage": "en",'],
  ['"description": "Mapa kaváren, pražíren a obchodů s kávou v Česku z otevřených dat OpenStreetMap."', '"description": "Map of cafés, coffee roasters and coffee shops in Czechia from open OpenStreetMap data."'],
  ['<aside class="panel" id="panel" aria-label="Kavárny">', '<aside class="panel" id="panel" aria-label="Cafés">'],
  ['<button class="sheet-handle" id="sheetHandle" aria-label="Rozbalit seznam">', '<button class="sheet-handle" id="sheetHandle" aria-label="Expand list">'],
  ['<a href="/" class="logo" aria-label="Kafemapa — úvod">', '<a href="/en/" class="logo" aria-label="Kafemapa — home">'],
  ['title="Žebříček měst" aria-label="Žebříček měst"', 'title="Town ranking" aria-label="Town ranking"'],
  ['aria-label="Menu: města, index, novinky, o projektu"', 'aria-label="Menu: towns, help, about"'],
  [
    '<p class="tagline"><span id="tagline">Všechny kavárny v Česku na jedné mapě.</span> <a href="/kavarny/">Podle měst&nbsp;→</a> <a href="/en/" lang="en" hreflang="en" class="lang-link">English</a></p>',
    '<p class="tagline"><span id="tagline">Every café in Czechia on one map.</span> <a href="/en/cities/">By town&nbsp;→</a> <a href="/" lang="cs" hreflang="cs" class="lang-link">Česky</a></p>',
  ],
  ['placeholder="Hledat kavárnu nebo město…" autocomplete="off" aria-label="Hledat kavárnu nebo město"', 'placeholder="Search a café or town…" autocomplete="off" aria-label="Search a café or town"'],
  ['aria-label="Vymazat hledání"', 'aria-label="Clear search"'],
  ['role="group" aria-label="Filtry"', 'role="group" aria-label="Filters"'],
  ['<i class="dot dot-open"></i>Otevřeno teď</button>', '<i class="dot dot-open"></i>Open now</button>'],
  ['aria-pressed="false">Nezávislé</button>', 'aria-pressed="false">Independent</button>'],
  ['aria-pressed="false">Zahrádka</button>', 'aria-pressed="false">Outdoor seating</button>'],
  ['aria-pressed="false">Bezbariérové</button>', 'aria-pressed="false">Wheelchair</button>'],
  ['aria-pressed="false">Pražírny a zrnka</button>', 'aria-pressed="false">Roasters &amp; beans</button>'],
  ['<span id="count" aria-live="polite">Načítám kavárny…</span>', '<span id="count" aria-live="polite">Loading cafés…</span>'],
  ['<svg><use href="#i-shuffle"/></svg>Překvap mě</button>', '<svg><use href="#i-shuffle"/></svg>Surprise me</button>'],
  ['aria-label="Skrýt"', 'aria-label="Hide"'],
  ['<div id="map" role="application" aria-label="Mapa kaváren"></div>', '<div id="map" role="application" aria-label="Café map"></div>'],
  ['title="Kavárny kolem mě" aria-label="Kavárny kolem mě"', 'title="Cafés near me" aria-label="Cafés near me"'],
  ['<span><i class="dot dot-open"></i>otevřeno</span>', '<span><i class="dot dot-open"></i>open</span>'],
  ['<span><i class="dot dot-closed"></i>zavřeno</span>', '<span><i class="dot dot-closed"></i>closed</span>'],
  ['<span><i class="dot dot-unknown"></i>neuvedeno</span>', '<span><i class="dot dot-unknown"></i>unknown</span>'],
  ['<h2 id="rankTitle">Kavárenský žebříček</h2>', '<h2 id="rankTitle">Town ranking</h2>'],
  ['data-tab="perCapita">Na 10 000 obyvatel</button>', 'data-tab="perCapita">Per 10,000 people</button>'],
  ['data-tab="total">Nejvíc kaváren</button>', 'data-tab="total">Most cafés</button>'],
  [
    '<p class="rank-more"><a href="/kavarensky-index/">Celý Kavárenský index: otevírací doby, řetězce a další čísla&nbsp;→</a></p>',
    '<p class="rank-more"><a href="/kavarensky-index/" hreflang="cs">The full Café Index (in Czech)&nbsp;→</a></p>',
  ],
  ['<noscript><p class="noscript">Kafemapa potřebuje ke svému běhu JavaScript.</p></noscript>', '<noscript><p class="noscript">Kafemapa needs JavaScript to run.</p></noscript>'],
];

// Celé bloky: upoutávka na index (ten je jen česky → na /en/ ji schováme) a obsah menu.
const BLOCKS = [
  [/<div class="promo" id="promo"[\s\S]*?<\/div>\n/, ''],
  [
    /<dialog id="dlgAbout"[\s\S]*?<\/dialog>/,
    `<dialog id="dlgAbout" class="dialog menu-dialog" aria-labelledby="aboutTitle">
    <header>
      <h2 id="aboutTitle">Menu</h2>
      <button class="icon-btn" data-close aria-label="Close"><svg><use href="#i-x"/></svg></button>
    </header>
    <nav class="menu-list" aria-label="More">
      <a href="/en/cities/"><span><strong>Cafés by town</strong><small>Prague, Brno, Český Krumlov and 120+ other towns</small></span><svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
      <a href="/en/help/"><span><strong>Help improve the data</strong><small>A third of cafés have no opening hours yet</small></span><svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
      <a href="/kavarensky-index/podzim-2026/" hreflang="cs"><span><strong>Café Index <span class="muted">(in Czech)</span></strong><small>Brno has more cafés per person than Prague</small></span><svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
    </nav>
    <p class="menu-foot"><a href="/en/about/">About</a><a href="/" lang="cs" hreflang="cs">Česky</a></p>
  </dialog>`,
  ],
];

export async function buildEnMap(root, outDir) {
  let html = await readFile(join(root, 'index.html'), 'utf8');
  for (const [cs, en] of PAIRS) {
    if (!html.includes(cs)) throw new Error(`build-en-map: v index.html chybí text k překladu:\n  ${cs}`);
    html = html.split(cs).join(en);
  }
  for (const [re, en] of BLOCKS) {
    if (!re.test(html)) throw new Error(`build-en-map: v index.html chybí blok ${re}`);
    html = html.replace(re, en);
  }
  html = html.replace(/<meta name="seznam-wmt"[^>]*>\n/, ''); // ověření Seznamu patří jen na úvodní stránku
  await mkdir(join(outDir, 'en'), { recursive: true });
  await writeFile(join(outDir, 'en', 'index.html'), html);
  return ['/en/'];
}
