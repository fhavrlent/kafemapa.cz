// Kavárenský index: stránky edic (/kavarensky-index/<edice>/) a rozcestník.
// Čísla bere výhradně ze zmrazených snapshotů v data/kavarensky-index/, texty
// jsou psané pro konkrétní edici. Tvrzení v textu hlídá assert(): když by
// neodpovídala snapshotu, build selže a nesmyslný text se nenasadí.

import { mkdir, writeFile, readFile, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { head, foot, esc, num, dec, plural, breadcrumbLd, SITE } from './build-pages.mjs';

const pct = (x) => `${Math.round(x * 100)} %`;
const time = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const thousands = (n) => `${Math.round(n / 1000)} tisíc`;

function assert(cond, msg) {
  if (!cond) throw new Error(`Kavárenský index: tvrzení v textu neodpovídá datům — ${msg}`);
}

/* ---------------- grafy ---------------- */

// Žebříček jako tabulka s pruhy: každá hodnota je popsaná na konci pruhu,
// takže graf je zároveň svou tabulkovou podobou (bez tooltipu i pro čtečky).
function barTable({ title, sub, rows, max }) {
  const top = max ?? Math.max(...rows.map((r) => r.value));
  return `<figure class="chart">
      <figcaption><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</figcaption>
      <table class="bars">
        <thead class="sr-only"><tr><th scope="col">Položka</th><th scope="col">Hodnota</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <th scope="row">${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : esc(r.label)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</th>
          <td><div class="bw"><span class="bar" style="--w:${((r.value / top) * 100).toFixed(2)}%"></span><span class="v">${esc(r.display)}</span></div></td>
        </tr>`
          )
          .join('\n        ')}
        </tbody>
      </table>
    </figure>`;
}

// Sloupcový histogram otevírání (SVG). Každý sloupec je zaměřitelný a má tooltip
// (assets/report.js); hodnoty jsou navíc v tabulce pod grafem.
function histogram({ title, sub, bins, labelOf }) {
  const W = 640, H = 230, L = 44, R = 8, T = 22, B = 30;
  const max = Math.max(...bins.map((b) => b.n));
  const step = max > 400 ? 200 : 100;
  const yMax = Math.ceil(max / step) * step;
  const band = (W - L - R) / bins.length;
  const bw = Math.min(24, band - 6);
  const y = (v) => T + (H - T - B) * (1 - v / yMax);
  const peak = bins.reduce((a, b) => (b.n > a.n ? b : a));
  const grid = [];
  for (let v = 0; v <= yMax; v += step) {
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'grid' : 'base'}"/>`);
    grid.push(`<text x="${L - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${num(v)}</text>`);
  }
  const cols = bins.map((b, i) => {
    const x = L + i * band + (band - bw) / 2;
    const top = y(b.n), base = y(0), r = Math.min(4, base - top);
    const d = b.n
      ? `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`
      : '';
    const tip = `${labelOf(b)}: ${num(b.n)} ${plural(b.n, ['kavárna', 'kavárny', 'kaváren'])}`;
    return `<g class="col" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">
        <rect class="hit" x="${L + i * band}" y="${T}" width="${band}" height="${H - T - B}"/>
        ${d ? `<path d="${d}"/>` : ''}
        ${b === peak ? `<text x="${x + bw / 2}" y="${top - 6}" class="peak" text-anchor="middle">${num(b.n)}</text>` : ''}
        ${i % 2 === 0 ? `<text x="${x + bw / 2}" y="${H - 10}" class="tick" text-anchor="middle">${b.h}:00</text>` : ''}
      </g>`;
  });
  return `<figure class="chart">
      <figcaption><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</figcaption>
      <div class="hist-wrap">
        <svg class="hist" viewBox="0 0 ${W} ${H}" aria-label="${esc(title)}">
          ${grid.join('\n          ')}
          ${cols.join('\n          ')}
        </svg>
      </div>
      <details class="table-view">
        <summary>Zobrazit jako tabulku</summary>
        <table>
          <thead><tr><th scope="col">Hodina otevření</th><th scope="col">Kaváren</th></tr></thead>
          <tbody>${bins.map((b) => `<tr><td>${esc(labelOf(b))}</td><td>${num(b.n)}</td></tr>`).join('')}</tbody>
        </table>
      </details>
    </figure>`;
}

const cityRows = (cities, extra = () => null) =>
  cities.map((c) => ({
    label: c.n,
    href: c.slug ? `/kavarny/${c.slug}/` : null,
    note: extra(c) ?? `${num(c.count)} míst · ${thousands(c.pop)} obyvatel`,
    value: c.r,
    display: dec(c.r),
  }));

/* ---------------- edice: podzim 2026 ---------------- */

function podzim2026(s) {
  const t = s.totals;
  const find = (list, n) => list.find((c) => c.n === n);
  const praha = find(s.regional, 'Praha');
  const brno = find(s.regional, 'Brno');
  const olomouc = find(s.regional, 'Olomouc');
  const usti = find(s.regional, 'Ústí nad Labem');
  const krumlov = s.perCapitaTop[0];
  const h = s.hours;
  const wd = Object.fromEntries(h.weekdays.map((d) => [d.d, d.share]));
  const peak = h.hist.reduce((a, b) => (b.n > a.n ? b : a));
  const stop = s.brands[0];
  const sbCosta = s.brands.filter((b) => ['Starbucks', 'Costa'].includes(b.b)).reduce((a, b) => a + b.n, 0);
  const cafeWord = s.names.find((n) => n.w === 'Café / Cafe');
  const kavarnaWord = s.names.find((n) => n.w === 'Kavárna');
  const [orlova, ...lowRest] = s.perCapitaBottom;

  // Tvrzení, na kterých texty stojí:
  assert(brno.r > praha.r && olomouc.r > praha.r, 'Brno i Olomouc nad Prahou');
  assert(s.regional.slice(0, 5).map((c) => c.n).join() === 'Brno,Olomouc,České Budějovice,Pardubice,Praha', 'pořadí krajských měst');
  assert(s.regional.at(-1) === usti && brno.r / usti.r > 5, 'Ústí poslední, rozdíl přes 5×');
  assert(krumlov.n === 'Český Krumlov', 'Krumlov první');
  assert(peak.h === 8, 'nejčastěji se otevírá mezi 8. a 9. hodinou');
  assert(wd['Čtvrtek'] > 0.98 && wd['Pátek'] > 0.98 && wd['Neděle'] < Math.min(...h.weekdays.filter((d) => d.d !== 'Neděle').map((d) => d.share)), 'neděle nejslabší');
  assert(stop.b === 'Stop Cafe' && stop.n > 2 * sbCosta, 'Stop Cafe víc než 2× Starbucks + Costa');
  assert(s.nonstop.chains / s.nonstop.n > 0.9, 'nonstop téměř jen řetězce');
  assert(cafeWord.n > kavarnaWord.n, 'café častěji než kavárna');
  assert(orlova.n === 'Orlová' && orlova.count === 0, 'Orlová bez kavárny');
  assert(lowRest.slice(0, 3).map((c) => c.n).join() === 'Chomutov,Krnov,Most', 'ručně skloňovaná města');
  const usMs = ['Orlová', 'Jirkov', 'Krnov', 'Chomutov', 'Most', 'Havířov', 'Karviná', 'Teplice', 'Litvínov', 'Děčín', 'Bohumín', 'Frýdek-Místek', 'Opava', 'Třinec', 'Nový Jičín'];
  assert(s.perCapitaBottom.filter((c) => usMs.includes(c.n)).length > s.perCapitaBottom.length / 2, 'konec žebříčku hlavně Ústecký a Moravskoslezský kraj');
  assert(s.completeness.best[0].n === 'Hradec Králové' && s.completeness.worst[0].n === 'Jihlava', 'úplnost dat');

  const lowRange = lowRest.slice(0, 3).map((c) => Math.round(10 / c.r)); // tisíc obyvatel na jedno místo
  const dataDate = new Date(s.edition.dataDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    title: 'Brno je kavárenštější než Praha',
    description: `Kavárenský index ${s.edition.name}: Brno má ${dec(brno.r)} míst s kávou na 10 000 obyvatel, Praha ${dec(praha.r)}. Kdy kavárny otevírají, kdo vaří kafe ve tři ráno a kde na mapě chybí.`,
    dek: `První Kavárenský index Kafemapy. Kolik kaváren připadá na obyvatele, kdy otevírají, kdo vaří kafe ve tři ráno a kde na mapě ještě chybí. Z otevřených dat OpenStreetMap k ${dataDate}.`,
    body: `
    <div class="hero-stats">
      <div class="hero"><span class="hero-v">${num(t.places)}</span><span class="hero-l">kaváren, pražíren a obchodů s kávou v OpenStreetMap</span></div>
      <dl class="stats">
        <div><dt>Brno, míst na 10 000 obyvatel</dt><dd>${dec(brno.r)}</dd><dd class="sub">Praha ${dec(praha.r)}</dd></div>
        <div><dt>Medián otevření ve všední den</dt><dd>${time(h.medianOpen)}</dd><dd class="sub">zavírá se v ${time(h.medianClose)}</dd></div>
        <div><dt>Podíl řetězců</dt><dd>${pct(t.chainShare)}</dd><dd class="sub">${num(t.chains)} míst</dd></div>
      </dl>
    </div>

    <figure class="dotmap">
      <img src="mapa.svg" width="760" height="440" alt="Tečková mapa ${num(t.places)} míst s kávou v Česku. Nejhustší jsou Praha a Brno, další shluky tvoří krajská města a turistická centra.">
      <figcaption>Každá tečka je jedno místo s kávou. Nejhustší jsou Praha a Brno, pak krajská města a turistická centra. <a href="/">Prozkoumat na mapě</a></figcaption>
    </figure>

    <section>
      <h2>Na obyvatele vládne Český Krumlov</h2>
      <p>V absolutních číslech vyhrává Praha s ${num(praha.count)} místy. Po přepočtu na obyvatele ale s velkým náskokem vede Český Krumlov: ${dec(krumlov.r)} místa s kávou na 10 000 obyvatel, ${dec(krumlov.r / praha.r)}krát víc než Praha. Turistická centra obsluhují i návštěvníky, a tak se v žebříčku drží vysoko i Mariánské Lázně nebo Kutná Hora.</p>
      ${barTable({ title: 'Míst s kávou na 10 000 obyvatel', sub: `Nejvyšší hustota, města nad 10 000 obyvatel (${t.citiesOver10k} měst)`, rows: cityRows(s.perCapitaTop) })}
    </section>

    <section>
      <h2>Krajská města: Brno a Olomouc před Prahou</h2>
      <p>Mezi krajskými městy vede Brno (${brno.r.toFixed(2).replace('.', ',')}) jen o setiny před Olomoucí (${olomouc.r.toFixed(2).replace('.', ',')}). Praha je až pátá, za Českými Budějovicemi a Pardubicemi. Na opačném konci je Ústí nad Labem, kde na 10 000 obyvatel připadá jen ${dec(usti.r)} místa s kávou. Rozdíl proti Brnu je víc než ${Math.floor(brno.r / usti.r)}násobný.</p>
      ${barTable({ title: 'Krajská města: míst s kávou na 10 000 obyvatel', rows: cityRows(s.regional) })}
    </section>

    <section>
      <h2>Kde kavárny na mapě chybí</h2>
      <p>Na konci žebříčku jsou hlavně menší průmyslová města v Ústeckém a Moravskoslezském kraji. V Orlové (${thousands(orlova.pop)} obyvatel) zatím OpenStreetMap neeviduje jedinou kavárnu. V ${lowRest.slice(0, 3).map((c) => c.n.replace('Most', 'Mostě').replace('Krnov', 'Krnově').replace('Chomutov', 'Chomutově')).join(', ').replace(/, ([^,]*)$/, ' nebo $1')} připadá jedno místo s kávou zhruba na ${Math.min(...lowRange)} až ${Math.max(...lowRange)} tisíc obyvatel.</p>
      <p>Část rozdílu je skutečná, část jsou ale díry v datech. OpenStreetMap tvoří dobrovolníci a ne každé město má někoho, kdo kavárny zapisuje. Znáte kavárnu v Orlové? <a href="https://www.openstreetmap.org/edit" rel="noopener">Přidejte ji</a>.</p>
      ${barTable({ title: 'Nejnižší hustota míst s kávou', sub: 'Na 10 000 obyvatel, města nad 20 000 obyvatel', rows: cityRows(s.perCapitaBottom), max: s.regional[0].r })}
      <p class="small muted">Stupnice je stejná jako u krajských měst, aby šly pruhy porovnat.</p>
    </section>

    <section>
      <h2>Česká kavárna otevírá v půl deváté</h2>
      <p>Medián otevření ve všední den je ${time(h.medianOpen)}, nezávislé kavárny otevírají spíš v ${time(h.indieMedianOpen)}. Nejčastěji se odemyká mezi osmou a devátou, do sedmé ráno má otevřeno jen ${pct(h.openBy7)} kaváren. Typicky se zavírá v ${time(h.medianClose)}, v pátek po deváté večer má otevřeno zhruba čtvrtina (${pct(h.fridayAfter21)}).</p>
      ${histogram({ title: 'Kdy kavárny otevírají', sub: `Středa, ${num(h.sample)} kaváren s uvedenou otevírací dobou (bez nonstop provozů)`, bins: h.hist, labelOf: (b) => `${b.h}:00–${b.h}:59` })}
    </section>

    <section>
      <h2>V neděli má zavřeno čtvrtina kaváren</h2>
      <p>Nejvíc kaváren má otevřeno ve čtvrtek a v pátek (přes ${Math.floor(Math.min(wd['Čtvrtek'], wd['Pátek']) * 100)} %). V neděli je to jen ${pct(wd['Neděle'])}, v sobotu ${pct(wd['Sobota'])} a v pondělí ${pct(wd['Pondělí'])}. Pondělí je přitom oblíbený zavírací den: ${num(h.closedMondayOnly)} kaváren má otevřeno celý týden kromě pondělí.</p>
      ${barTable({ title: 'Podíl kaváren, které mají v daný den otevřeno', sub: 'Kavárny s uvedenou otevírací dobou, bez nonstop provozů', rows: h.weekdays.map((d) => ({ label: d.d, value: d.share, display: pct(d.share) })), max: 1 })}
    </section>

    <section>
      <h2>Kafe ve tři ráno? Na benzince</h2>
      <p>Nonstop má otevřeno ${num(s.nonstop.n)} míst s kávou a ${num(s.nonstop.chains)} z nich patří do řetězců, skoro vždy u čerpacích stanic. Největší „kavárenskou sítí“ v Česku je tak Stop Cafe na pumpách Orlen s ${num(stop.n)} pobočkami, víc než dvojnásobek Starbucks a Costa dohromady (${num(sbCosta)}). Řetězce celkem tvoří ${pct(t.chainShare)} všech míst, zbytek jsou nezávislé podniky.</p>
      ${barTable({ title: 'Největší sítě', sub: 'Počet míst v OpenStreetMap', rows: s.brands.map((b) => ({ label: b.b, value: b.n, display: num(b.n) })) })}
    </section>

    <section>
      <h2>Café, nebo kavárna?</h2>
      <p>V názvech vyhrává mezinárodní „café“ (${num(cafeWord.n)} podniků) nad českou „kavárnou“ (${num(kavarnaWord.n)}). Anglické „coffee“ má v názvu ${num(s.names.find((n) => n.w === 'Coffee').n)} míst, hovorové „kafe“ ${num(s.names.find((n) => n.w === 'Kafe').n)}.</p>
      ${barTable({ title: 'Slova v názvech kaváren', sub: 'Jeden název může obsahovat víc slov', rows: s.names.map((n) => ({ label: n.w, value: n.n, display: num(n.n) })) })}
    </section>

    <section>
      <h2>Co o kavárnách zatím nevíme</h2>
      <p>Otevírací dobu má v OpenStreetMap uvedenou ${pct(t.hoursShare)} míst, zahrádku ${pct(t.outdoorShare)} kaváren a Wi‑Fi ${pct(t.wifiShare)}. To neznamená, že ostatní zahrádku nemají, jen to zatím nikdo nezapsal. Nejúplnější data má Hradec Králové, nejvíc chybí v Jihlavě a v západních Čechách.</p>
      <div class="two">
        ${barTable({ title: 'Nejúplnější data', sub: 'Podíl míst s otevírací dobou, města s aspoň 20 místy', rows: cityRows(s.completeness.best, (c) => `${num(c.count)} míst`).map((r, i) => ({ ...r, value: s.completeness.best[i].hours, display: pct(s.completeness.best[i].hours) })), max: 1 })}
        ${barTable({ title: 'Nejvíc chybí', sub: 'Podíl míst s otevírací dobou', rows: cityRows(s.completeness.worst, (c) => `${num(c.count)} míst`).map((r, i) => ({ ...r, value: s.completeness.worst[i].hours, display: pct(s.completeness.worst[i].hours) })), max: 1 })}
      </div>
      <aside class="cta">
        <h3>Pomozte doplnit data</h3>
        <p>Každá oprava v OpenStreetMap se projeví na Kafemapě i v dalším vydání indexu. Otevřete kavárnu na <a href="/">mapě</a>, klikněte na <em>Upravit v OSM</em> a doplňte otevírací dobu, zahrádku nebo web. Chybějící kavárnu přidáte v <a href="https://www.openstreetmap.org/edit" rel="noopener">editoru OpenStreetMap</a>.</p>
      </aside>
    </section>

    <section id="metodika">
      <h2>Metodika</h2>
      <ul>
        <li>Zdrojem jsou data <a href="https://www.openstreetmap.org/" rel="noopener">OpenStreetMap</a> k ${dataDate}: všechny objekty s tagem <code>amenity=cafe</code> (${num(t.cafes)}) a <code>shop=coffee</code> (${num(t.shops)}) v Česku, které mají jméno.</li>
        <li>Každé místo je přiřazené k nejbližšímu z ${num(t.cities)} měst s dosahem podle velikosti města (od 2,5 km u malých měst po 14 km u Prahy). ${num(t.unassigned)} míst mimo dosah měst se do žebříčků nepočítá. Počty obyvatel jsou z <a href="https://data.csu.gov.cz/datastat/info/SADA/OBY02A" rel="noopener">Českého statistického úřadu</a> (stav k 1. 1. 2026).</li>
        <li>Hustotu porovnáváme jen u měst nad 10 000 obyvatel (u nejnižší hustoty nad 20 000), menší města mají příliš malá čísla.</li>
        <li>Otevírací doba vychází z tagu <code>opening_hours</code>, který šlo strojově přečíst u ${num(t.parsedHours)} kaváren. Svátky a výjimky nepočítáme. Rozložení otevírání je za středu.</li>
        <li>Řetězec je místo s tagem <code>brand</code>. Údaje o zahrádce nebo Wi‑Fi znamenají „uvedeno v OSM“, ne „neexistuje“.</li>
        <li>Data v OpenStreetMap nejsou úplná. Index měří to, co je zmapované, a nízká čísla mohou znamenat i chybějící data.</li>
      </ul>
    </section>

    <section id="pro-media" class="press">
      <h2>Pro média</h2>
      <p>Čísla, grafy i texty Kavárenského indexu můžete volně použít s uvedením zdroje (licence <a href="https://creativecommons.org/licenses/by/4.0/deed.cs" rel="noopener">CC BY 4.0</a>):</p>
      <blockquote>Zdroj: Kavárenský index ${esc(s.edition.name)}, Kafemapa.cz. Data © přispěvatelé OpenStreetMap.</blockquote>
      <p>Všechna čísla této edice jsou ke stažení jako <a href="data.json">JSON</a>, tečková mapa jako <a href="mapa.svg">SVG</a>. Čísla edice se už nemění, aktuální stav ukazuje <a href="/">mapa</a> a <a href="/kavarny/">stránky měst</a>.</p>
    </section>`,
  };
}

const EDITIONS = { 'podzim-2026': podzim2026 };

/* ---------------- sestavení ---------------- */

export async function buildReport(root, outDir, meta) {
  const dir = join(root, 'data', 'kavarensky-index');
  const slugs = Object.keys(EDITIONS);
  const editions = [];
  for (const slug of slugs) {
    const s = JSON.parse(await readFile(join(dir, `${slug}.json`), 'utf8'));
    const e = EDITIONS[slug](s);
    const path = `/kavarensky-index/${slug}/`;
    const out = join(outDir, 'kavarensky-index', slug);
    await mkdir(out, { recursive: true });
    await copyFile(join(dir, `${slug}-mapa.svg`), join(out, 'mapa.svg'));
    await copyFile(join(dir, `${slug}.json`), join(out, 'data.json'));
    let image;
    try {
      await access(join(dir, `${slug}-og.png`));
      await copyFile(join(dir, `${slug}-og.png`), join(out, 'og.png'));
      image = `${path}og.png`;
    } catch {}
    const html =
      head({
        title: `${e.title} | Kavárenský index ${s.edition.name}`,
        description: e.description,
        path,
        image,
        jsonLd: [
          breadcrumbLd([['Kafemapa', '/'], ['Kavárenský index', '/kavarensky-index/'], [s.edition.name, path]]),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: e.title,
            description: e.description,
            datePublished: s.edition.created,
            inLanguage: 'cs',
            publisher: { '@type': 'Organization', name: 'Kafemapa', url: SITE },
            mainEntityOfPage: SITE + path,
            ...(image ? { image: SITE + image } : {}),
          },
        ],
      }) +
      `
  <main class="page-main report">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <a href="/kavarensky-index/">Kavárenský index</a> › <span>${esc(s.edition.name)}</span></nav>
    <p class="eyebrow">Kavárenský index · ${esc(s.edition.name)}</p>
    <h1>${esc(e.title)}</h1>
    <p class="lead">${esc(e.dek)}</p>
    ${e.body}
  </main>
  <div class="tip" role="tooltip" hidden></div>
  <script type="module" src="/assets/report.js"></script>` +
      foot(meta);
    await writeFile(join(out, 'index.html'), html);
    editions.push({ slug, s, e, path });
  }

  // Rozcestník edic (nejnovější první)
  const latest = editions.at(-1);
  await writeFile(
    join(outDir, 'kavarensky-index', 'index.html'),
    head({
      title: 'Kavárenský index | Kafemapa',
      description: 'Kavárenský index: kolik kaváren připadá na obyvatele českých měst, kdy otevírají a kde chybí. Pravidelně z otevřených dat OpenStreetMap.',
      path: '/kavarensky-index/',
      image: latest.path + 'og.png',
      jsonLd: breadcrumbLd([['Kafemapa', '/'], ['Kavárenský index', '/kavarensky-index/']]),
    }) +
      `
  <main class="page-main">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <span>Kavárenský index</span></nav>
    <h1>Kavárenský index</h1>
    <p class="lead">Jak si česká města stojí v kavárnách? Kavárenský index vychází dvakrát do roka z otevřených dat OpenStreetMap: hustota kaváren na obyvatele, otevírací doby, řetězce a mezery v datech.</p>
    <ol class="editions">
      ${editions
        .slice()
        .reverse()
        .map(
          (x) => `<li><a href="${x.path}"><span class="eyebrow">${esc(x.s.edition.name)}</span><strong>${esc(x.e.title)}</strong><span class="muted">${esc(x.e.dek)}</span></a></li>`
        )
        .join('\n      ')}
    </ol>
  </main>` +
      foot(meta)
  );

  return ['/kavarensky-index/', ...editions.map((x) => x.path)];
}
