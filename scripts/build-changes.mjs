// „Nově na mapě“: stránka /nove/ a RSS /nove/feed.xml z data/changes.json.
// Volá ho scripts/build.mjs.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cafePath } from '../assets/slug.js';
import { head, foot, esc, num, plural, breadcrumbLd, SITE } from './build-pages.mjs';

const WEEKS_ON_PAGE = 12;
/** @param {string} iso @param {Intl.DateTimeFormatOptions} [opts] */
const czDate = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('cs-CZ', opts);
const range = (e) => `${czDate(e.from, { day: 'numeric', month: 'numeric' })}–${czDate(e.date, { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

function summary(e) {
  const parts = [];
  if (e.added.length) parts.push(`${num(e.added.length)} ${plural(e.added.length, ['nové místo', 'nová místa', 'nových míst'])}`);
  const hours = e.hoursAdded.length + e.hoursChanged.length;
  if (hours) parts.push(`${num(hours)}× doplněná nebo opravená otevírací doba`);
  if (e.removed.length) parts.push(`${num(e.removed.length)} ${plural(e.removed.length, ['místo zmizelo', 'místa zmizela', 'míst zmizelo'])}`);
  return parts.length ? parts.join(', ') : 'beze změn';
}

export async function buildChanges(root, outDir, data) {
  let history = [];
  try {
    history = JSON.parse(await readFile(join(root, 'data', 'changes.json'), 'utf8'));
  } catch {}
  const current = new Map(data.cafes.map((c) => [c.i, c]));
  // Odkaz na kavárnu: její stránka, jinak místo na mapě; zmizelá místa odkaz nemají.
  const link = (b) => {
    const c = current.get(b.i);
    if (!c) return null;
    return cafePath(c, c.c != null ? data.cities[c.c]?.n : null) || `/#${c.i}`;
  };
  const item = (b, withLink = true) => {
    const href = withLink ? link(b) : null;
    return `<li>${href ? `<a href="${href}">${esc(b.n)}</a>` : esc(b.n)}${b.c ? ` <span class="muted">· ${esc(b.c)}</span>` : ''}</li>`;
  };
  const block = (title, list, note, withLink = true) =>
    list.length
      ? `<h3>${title} (${num(list.length)})</h3>${note ? `<p class="small muted">${note}</p>` : ''}<ul class="change-list">${list.map((b) => item(b, withLink)).join('')}</ul>`
      : '';

  const weeks = history.slice(0, WEEKS_ON_PAGE);
  const body = weeks.length
    ? weeks
        .map(
          (e) => `<section class="week-changes" id="${e.week ?? e.date}">
      <h2>${range(e)}</h2>
      <p class="lead">${esc(summary(e))}</p>
      ${block('Nová místa', e.added)}
      ${block('Doplněná otevírací doba', e.hoursAdded, 'Díky všem, kdo ji zapsali do OpenStreetMap.')}
      ${block('Změněná otevírací doba', e.hoursChanged)}
      ${block('Zmizela z mapy', e.removed, 'Zavřela, přestěhovala se, nebo je někdo z OpenStreetMap odstranil. Pokud některé místo pořád funguje, můžete ho do mapy vrátit.', false)}
    </section>`
        )
        .join('\n    ')
    : `<p class="cta">První přehled změn se objeví po příští aktualizaci dat (každé ráno). Mezitím můžete <a href="/doplnit/">pomoct doplnit chybějící údaje</a>, objeví se tu.</p>`;

  const html =
    head({
      title: 'Nově na mapě: nové kavárny a změny | Kafemapa',
      description: 'Každý týden: nové kavárny v Česku, doplněné a změněné otevírací doby a místa, která z mapy zmizela. Z dat OpenStreetMap.',
      path: '/nove/',
      jsonLd: breadcrumbLd([['Kafemapa', '/'], ['Nově na mapě', '/nove/']]),
      extraCss: `  <link rel="alternate" type="application/rss+xml" title="Kafemapa: nově na mapě" href="${SITE}/nove/feed.xml">\n`,
    }) +
    `
  <main class="page-main report">
    <nav class="crumbs" aria-label="Drobečková navigace"><a href="/">Kafemapa</a> › <span>Nově na mapě</span></nav>
    <h1>Nově na mapě</h1>
    <p class="lead">Co se změnilo v kavárnách za poslední týden: nová místa, doplněné otevírací doby a místa, která z mapy zmizela. Data se z OpenStreetMap aktualizují každý den, přehled změn je po týdnech. Odebírat můžete i přes <a href="/nove/feed.xml">RSS</a>.</p>
    ${body}
  </main>` +
    foot(data);

  await mkdir(join(outDir, 'nove'), { recursive: true });
  await writeFile(join(outDir, 'nove', 'index.html'), html);

  // RSS 2.0: jedna položka za týden.
  const xml = (s) => String(s).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);
  const items = history.slice(0, 20).map((e) => {
    const desc = [
      e.added.length ? `<p>Nová místa: ${e.added.map((b) => b.n + (b.c ? ` (${b.c})` : '')).join(', ')}</p>` : '',
      e.hoursAdded.length ? `<p>Doplněná otevírací doba: ${e.hoursAdded.map((b) => b.n).join(', ')}</p>` : '',
      e.removed.length ? `<p>Zmizela z mapy: ${e.removed.map((b) => b.n).join(', ')}</p>` : '',
    ].join('');
    return `    <item>
      <title>${xml(`${range(e)}: ${summary(e)}`)}</title>
      <link>${SITE}/nove/#${e.week ?? e.date}</link>
      <guid isPermaLink="false">kafemapa-zmeny-${e.week ?? e.date}</guid>
      <pubDate>${new Date(`${e.date}T06:00:00Z`).toUTCString()}</pubDate>
      <description>${xml(desc || summary(e))}</description>
    </item>`;
  });
  await writeFile(
    join(outDir, 'nove', 'feed.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kafemapa: nově na mapě</title>
    <link>${SITE}/nove/</link>
    <atom:link href="${SITE}/nove/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Nové kavárny v Česku a změny otevíracích dob, každý týden z OpenStreetMap.</description>
    <language>cs</language>
${items.join('\n')}
  </channel>
</rss>
`
  );
  return ['/nove/'];
}
