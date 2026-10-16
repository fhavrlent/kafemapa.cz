// Změny v datech mezi dvěma staženími: co přibylo, co zmizelo, kde se doplnila nebo změnila otevírací doba.
// Volá ho scripts/fetch-data.mjs před přepsáním data/cafes.json.

const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const h = Math.sin(((b.y - a.y) * rad) / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(((b.x - a.x) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Do historie ukládáme jen to, co stránka změn potřebuje (a co přežije další aktualizace).
const brief = (c, data) => ({ i: c.i, n: c.n, ...(c.c != null && data.cities[c.c] ? { c: data.cities[c.c].n } : {}), y: c.y, x: c.x });

/**
 * @param prev předchozí data/cafes.json (nebo null)
 * @param next nová data
 * @returns {{date, added, removed, hoursAdded, hoursChanged}}
 */
export function computeChanges(prev, next) {
  const date = (next.osmBase || next.generated).slice(0, 10);
  const empty = { date, from: null, added: [], removed: [], hoursAdded: [], hoursChanged: [] };
  if (!prev) return empty;

  const before = new Map(prev.cafes.map((c) => [c.i, c]));
  const after = new Map(next.cafes.map((c) => [c.i, c]));
  let added = next.cafes.filter((c) => !before.has(c.i));
  let removed = prev.cafes.filter((c) => !after.has(c.i));

  // Překreslení v OSM (bod → obrys budovy) mění id. Stejné jméno do 100 m = stejný podnik.
  const pairs = [];
  for (const a of added) {
    const r = removed.find((r) => !r._paired && norm(r.n) === norm(a.n) && km(r, a) < 0.1);
    if (r) {
      r._paired = true;
      a._paired = true;
      pairs.push([r, a]);
    }
  }
  added = added.filter((c) => !c._paired);
  removed = removed.filter((c) => !c._paired);

  const hoursAdded = [];
  const hoursChanged = [];
  const same = [...next.cafes.filter((c) => before.has(c.i)).map((c) => [before.get(c.i), c]), ...pairs];
  for (const [old, cur] of same) {
    if (!old.o && cur.o) hoursAdded.push(brief(cur, next));
    else if (old.o && cur.o && old.o !== cur.o) hoursChanged.push(brief(cur, next));
  }

  const byName = (a, b) => a.n.localeCompare(b.n, 'cs');
  return {
    date,
    from: (prev.osmBase || prev.generated).slice(0, 10),
    added: added.map((c) => brief(c, next)).sort(byName),
    removed: removed.map((c) => brief(c, prev)).sort(byName),
    hoursAdded: hoursAdded.sort(byName),
    hoursChanged: hoursChanged.sort(byName),
  };
}

// Týden začíná pondělím; data se stahují denně, ale přehled změn je po týdnech.
export function weekOf(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const key = (c) => c.i ?? c.n;
const byName = (a, b) => a.n.localeCompare(b.n, 'cs');
// Sjednocení podle id, novější záznam vyhrává; bez těch, která patří jinam.
const union = (a, b, without = new Set()) => [...new Map([...a, ...b].map((c) => [key(c), c])).values()].filter((c) => !without.has(key(c))).sort(byName);

// Den k dosavadnímu týdnu: místo přidané a ve stejném týdnu zase odebrané se neukazuje vůbec,
// nové místo nepočítáme zároveň jako „doplněnou otevírací dobu“.
function mergeDay(week, day) {
  const ids = (l) => new Set(l.map(key));
  const removedNow = ids(day.removed), addedNow = ids(day.added);
  const added = union(week.added.filter((c) => !removedNow.has(key(c))), day.added.filter((c) => !ids(week.removed).has(key(c))));
  const removed = union(week.removed.filter((c) => !addedNow.has(key(c))), day.removed.filter((c) => !ids(week.added).has(key(c))));
  const skip = new Set([...ids(added), ...ids(removed)]);
  const hoursAdded = union(week.hoursAdded, day.hoursAdded, skip);
  const hoursChanged = union(week.hoursChanged, day.hoursChanged, new Set([...skip, ...ids(hoursAdded)]));
  return { ...week, date: day.date, added, removed, hoursAdded, hoursChanged };
}

// Historie změn: nejnovější týden první, nejvýš rok zpátky.
export function appendChanges(history, entry, keep = 52) {
  // první stažení nemá s čím srovnávat a opakované stažení téhož dne nic nového nepřinese
  if (!entry.from || entry.from === entry.date) return history;
  const week = weekOf(entry.date);
  const [last, ...rest] = history;
  if (last && (last.week ?? weekOf(last.date)) === week) return [mergeDay({ ...last, week }, entry), ...rest];
  return [{ ...entry, week }, ...history].slice(0, keep);
}
