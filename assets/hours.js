// Lehký parser OSM tagu opening_hours pro nejčastější zápisy
// („Mo-Fr 08:00-18:00; Sa,Su 09:00-14:00; PH off“, „24/7“, přes půlnoc, …).
// Co neumí spolehlivě přečíst (měsíce, data, východ slunce…), vrací null
// a web pak ukáže otevírací dobu jen jako text.

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const MONTH_SEL_RE = new RegExp(`^(${MON}(?:\\s*-\\s*${MON})?(?:\\s*,\\s*${MON}(?:\\s*-\\s*${MON})?)*)\\s*:?\\s+`);

function monthMatches(sel, month) {
  for (const part of sel.split(',')) {
    const [a, b] = part.split('-').map((x) => MONTHS.indexOf(x.trim()));
    const end = b >= 0 ? b : a;
    if (a <= end ? month >= a && month <= end : month >= a || month <= end) return true;
  }
  return false;
}

function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 48 || min > 59) return null;
  return h * 60 + min;
}

function parseDays(sel) {
  const days = new Set();
  let onlyHolidays = true;
  for (let part of sel.split(',')) {
    part = part.trim();
    if (!part) continue;
    if (part === 'PH' || part === 'SH') continue;
    onlyHolidays = false;
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part);
    if (!range) return null;
    const a = DAYS.indexOf(range[1]);
    const b = range[2] ? DAYS.indexOf(range[2]) : a;
    for (let d = a, guard = 0; guard < 7; d = (d + 1) % 7, guard++) {
      days.add(d);
      if (d === b) break;
    }
  }
  return { days, onlyHolidays };
}

function parseTimes(s) {
  const out = [];
  for (let part of s.split(',')) {
    part = part.trim();
    if (!part) continue;
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/.exec(part);
    if (!m) return null;
    const start = parseTime(m[1]);
    let end = parseTime(m[2]);
    if (start == null || end == null) return null;
    if (end <= start) end += 1440;
    out.push([start, end]);
  }
  return out.length ? out : null;
}

/**
 * @param {string} str hodnota opening_hours
 * @param {Date} [date] pro pravidla omezená na měsíce („May-Sep: …“)
 * @returns {Array<Array<[number, number]>> | null} pro každý den (Po=0) seznam intervalů v minutách
 */
export function parseHours(str, date = new Date()) {
  if (!str) return null;
  let s = str
    .replace(/"[^"]*"/g, '') // komentáře
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s*h\b/g, '$1')
    .trim();
  if (/^24\/7$/.test(s)) return DAYS.map(() => [[0, 1440]]);

  // Chybějící středník mezi pravidly: „…19:00, Sa-Su …“ nebo „…19:00 Sa-Su …“
  s = s.replace(new RegExp(`(\\d|off|closed)\\s*,?\\s+(?=(?:${DAY_RE}|${MON})\\b)`, 'g'), '$1; ');
  s = s.replace(new RegExp(`(\\d)\\s*,\\s*(?=(?:${DAY_RE}|${MON})\\b)`, 'g'), '$1; ');

  const week = DAYS.map(() => []);
  let any = false;
  for (let rule of s.split(';')) {
    rule = rule.trim();
    if (!rule) continue;
    const ms = MONTH_SEL_RE.exec(rule + ' ');
    if (ms) {
      any = true; // sezónní pravidlo mimo sezónu = zavřeno
      if (!monthMatches(ms[1].replace(/\s+/g, ''), date.getMonth())) continue;
      rule = rule.slice(ms[0].length).trim();
    }
    const m = new RegExp(`^(${DAY_RE}(?:\\s*[-,]\\s*${DAY_RE})*)?\\s*(.*)$`).exec(rule);
    if (!m) return null;
    const [, sel, rest] = m;
    let days;
    if (sel) {
      const parsed = parseDays(sel);
      if (!parsed) return null;
      if (parsed.onlyHolidays) continue; // svátky ignorujeme
      days = parsed.days;
    } else {
      days = new Set(DAYS.map((_, i) => i));
    }
    const body = rest.trim();
    let times;
    if (/^(off|closed)$/i.test(body)) times = [];
    else if (body === '24/7' || body === '00:00-24:00') times = [[0, 1440]];
    else {
      times = parseTimes(body);
      if (!times) return null;
    }
    for (const d of days) week[d] = times; // pozdější pravidlo přebíjí dřívější
    any = true;
  }
  return any ? week : null;
}

const dayIndex = (date) => (date.getDay() + 6) % 7; // Po=0
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();

export const fmtMin = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * @returns {{open: boolean, soon?: boolean, until?: number, next?: {day: number, at: number}} | null}
 */
export function statusAt(week, date = new Date()) {
  if (!week) return null;
  const d = dayIndex(date);
  const now = minutesOf(date);
  // dnešní intervaly + přesah z včerejška
  const yest = (d + 6) % 7;
  for (const [a, b] of week[yest]) {
    if (b > 1440 && now < b - 1440) return { open: true, until: b - 1440, soon: b - 1440 - now <= 30 };
  }
  for (const [a, b] of week[d]) {
    if (now >= a && now < b) return { open: true, until: b, soon: b - now <= 30 };
  }
  // kdy se otevře příště
  for (let off = 0; off < 8; off++) {
    const day = (d + off) % 7;
    const starts = week[day].map(([a]) => a).filter((a) => off > 0 || a > now).sort((x, y) => x - y);
    if (starts.length) return { open: false, next: { day: off, at: starts[0] } };
  }
  return { open: false };
}

const CZ_DAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

/**
 * Lidsky čitelný týden: „po–pá 8:00–18:00, so 9:00–14:00, ne zavřeno“.
 * Stejné po sobě jdoucí dny slučuje, celý týden stejně = „denně …“.
 */
export function formatWeek(week) {
  if (!week) return null;
  const txt = week.map((iv) =>
    !iv.length ? 'zavřeno' : iv.map(([a, b]) => (a === 0 && b >= 1440 ? 'nonstop' : `${fmtMin(a)}–${fmtMin(b)}`)).join(', ')
  );
  if (txt.every((t) => t === txt[0])) return txt[0] === 'nonstop' ? 'nonstop' : `denně ${txt[0]}`;
  const parts = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && txt[j + 1] === txt[i]) j++;
    const days = i === j ? CZ_DAYS[i] : `${CZ_DAYS[i]}${j === i + 1 ? ', ' : '–'}${CZ_DAYS[j]}`;
    parts.push(`${days} ${txt[i]}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

/**
 * Stav pro zobrazení: { cls: 'open' | 'soon' | 'closed', text }, nebo null, když doba není známa.
 */
export function statusLabel(week, now = new Date()) {
  if (!week) return null;
  if (week.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { cls: 'open', text: 'Nonstop' };
  const s = statusAt(week, now);
  if (s.open) {
    if (s.soon) return { cls: 'soon', text: `Zavírá v ${fmtMin(s.until)}` };
    return { cls: 'open', text: `Otevřeno do ${s.until % 1440 === 0 ? 'půlnoci' : fmtMin(s.until)}` };
  }
  if (!s.next) return { cls: 'closed', text: 'Zavřeno' };
  const at = fmtMin(s.next.at);
  const day = (dayIndex(now) + s.next.day) % 7;
  const when = s.next.day === 0 ? `v ${at}` : s.next.day === 1 ? `zítra v ${at}` : `${CZ_DAYS[day]} v ${at}`;
  return { cls: 'closed', text: `Zavřeno · otevře ${when}` };
}
