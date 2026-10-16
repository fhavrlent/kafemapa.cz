// Přímý zápis do OpenStreetMap (otevírací doba, později vybavení): přihlášení účtem OSM (OAuth 2 + PKCE,
// heslo vidí jen OSM) a uložení jedné hodnoty opening_hours do existujícího objektu.
//
// Pravidla, která drží zápis pod kontrolou (dohodnuto před spuštěním):
// - měníme jen vyjmenované tagy (EDITABLE) u kavárny, která už v OSM je; objekty nepřidáváme ani nemažeme;
// - otevírací dobu ověří náš parser; beze změny se nic neposílá;
// - každá úprava je samostatná sada změn s created_by=Kafemapa a #kafemapa, dohledatelná komunitou;
// - zápis jde přes verzi objektu: když ho mezitím někdo upravil, OSM vrátí konflikt a nic nepřepíšeme;
// - OSM_SAVE = false tlačítko vypne a formulář se vrátí k ručnímu „zkopírovat a otevřít editor“.
//
// Mimo produkci (localhost, 127.0.0.1) se všechno posílá na testovací server OSM.

export const LIVE = location.hostname === 'kafemapa.cz' || location.hostname === 'www.kafemapa.cz';

// Vypínač přímého ukládání. Na produkci zatím vypnuto: před spuštěním oznámit české komunitě OSM
// (fórum community.openstreetmap.org), ať o úpravách s #kafemapa ví. Lokálně (testovací server) zapnuto.
export const OSM_SAVE = !LIVE;
export const API = LIVE ? 'https://api.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';
export const WEB = LIVE ? 'https://www.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';
// Client ID aplikací registrovaných na openstreetmap.org a na testovacím serveru (nejsou tajné).
const CLIENT_ID = LIVE ? 'N_OnO3_MazcW0n9KXXBsaSUUorVdd-Gy6mH1-XiNK-A' : '5KVkT0c-9TRXjH7-duH8ql2ZU-YxHehI71DcMQiIXPo';
const REDIRECT = LIVE ? 'https://kafemapa.cz/osm/' : `${location.origin}/osm/`;
const SCOPE = 'read_prefs write_api';
const TOKEN_KEY = `kafemapa:osm-token:${LIVE ? 'live' : 'dev'}`;

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  },
};

/* ---------------- přihlášení ---------------- */

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export const isLoggedIn = () => !!store.get(TOKEN_KEY);
export const logout = () => store.set(TOKEN_KEY, null);

const AUTH = 'kafemapa:osm-auth';
const RESUME = 'kafemapa:osm-resume';

async function authorizeUrl(verifier, state) {
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${WEB}/oauth2/authorize?${q}`;
}

async function exchange(code, verifier) {
  const res = await fetch(`${WEB}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier }),
  });
  if (!res.ok) throw Object.assign(new Error(`token HTTP ${res.status}`), { code: 'token' });
  store.set(TOKEN_KEY, (await res.json()).access_token);
}

/**
 * Přihlášení do OSM. Volat přímo z kliknutí. Primárně v novém okně; když ho prohlížeč
 * zablokuje (mobilní a vestavěné prohlížeče), přejde na přihlášení celá stránka a po něm se
 * vrátí sem. `resume` (rozpracovaný formulář) si mezitím pamatujeme v sessionStorage.
 * @param {object} [resume] co obnovit po návratu, např. { i, value, source }
 * @returns {Promise<void>} po získání tokenu (při přesměrování se nevyřeší, stránka odejde)
 */
export function login(resume) {
  const verifier = random(48);
  const state = random(16);
  // Okno otevřít hned, adresu doplnit po výpočtu otisku (async), jinak ho blokátor zastaví.
  const popup = window.open('about:blank', 'kafemapa-osm-login', 'width=520,height=720');
  if (!popup) {
    return (async () => {
      sessionStorage.setItem(AUTH, JSON.stringify({ verifier, state, back: location.href }));
      if (resume) sessionStorage.setItem(RESUME, JSON.stringify(resume));
      location.href = await authorizeUrl(verifier, state);
      await new Promise(() => {});
    })();
  }

  return (async () => {
    popup.location = await authorizeUrl(verifier, state);

    const code = await new Promise((resolve, reject) => {
      const ok = new Set([location.origin, 'https://kafemapa.cz', 'https://www.kafemapa.cz']);
      const onMsg = (e) => {
        if (!ok.has(e.origin) || e.data?.type !== 'kafemapa-osm') return;
        cleanup();
        if (e.data.error || e.data.state !== state || !e.data.code) reject(Object.assign(new Error(e.data.error || 'state'), { code: 'denied' }));
        else resolve(e.data.code);
      };
      // Zavřené okno bez odpovědi = uživatel to vzdal.
      const timer = setInterval(() => popup.closed && (cleanup(), reject(Object.assign(new Error('closed'), { code: 'closed' }))), 700);
      const cleanup = () => (removeEventListener('message', onMsg), clearInterval(timer));
      addEventListener('message', onMsg);
    });

    await exchange(code, verifier);
  })();
}

/** Návratová stránka /osm/ při přihlášení přesměrováním: vymění kód za token a vrátí se zpět. */
export async function completeRedirect(params) {
  const saved = JSON.parse(sessionStorage.getItem(AUTH) || 'null');
  sessionStorage.removeItem(AUTH);
  if (!saved) return '/';
  if (!params.get('error') && params.get('code') && params.get('state') === saved.state) await exchange(params.get('code'), saved.verifier);
  return saved.back;
}

/** Rozpracovaný formulář z doby před přesměrováním na přihlášení (jednorázově). kind: 'hours' | 'amenities' */
export function takeResume(id, kind = 'hours') {
  try {
    const r = JSON.parse(sessionStorage.getItem(RESUME) || 'null');
    if (!r || r.i !== id || (r.kind || 'hours') !== kind) return null;
    sessionStorage.removeItem(RESUME);
    return r;
  } catch {
    return null;
  }
}
export const hasResume = () => {
  try {
    return !!sessionStorage.getItem(RESUME);
  } catch {
    return false;
  }
};

/* ---------------- API ---------------- */

/**
 * @param {string} path
 * @param {{ method?: string, body?: string, auth?: boolean }} [opts]
 */
async function api(path, { method = 'GET', body = undefined, auth = false } = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${store.get(TOKEN_KEY)}`;
  if (body) headers['Content-Type'] = 'text/xml';
  const res = await fetch(`${API}/api/0.6${path}`, { method, headers, body, cache: 'no-store' });
  if (res.status === 401 && auth) logout(); // token zrušený v nastavení OSM
  if (!res.ok) throw Object.assign(new Error(`${method} ${path}: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim()), { status: res.status });
  return res;
}

export async function userName() {
  const res = await api('/user/details.json', { auth: true });
  return (await res.json()).user?.display_name;
}

const TYPE = { n: 'node', w: 'way', r: 'relation' };
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const tagsXml = (tags) => Object.entries(tags).map(([k, v]) => `<tag k="${xmlEsc(k)}" v="${xmlEsc(v)}"/>`).join('');

/** Aktuální stav objektu přímo z OSM (bez přihlášení). */
export async function fetchElement(osmId) {
  const res = await api(`/${TYPE[osmId[0]]}/${osmId.slice(1)}.json`);
  return (await res.json()).elements[0];
}

function elementXml(el, tags, changeset) {
  const attrs = `id="${el.id}" version="${el.version}" changeset="${changeset}"`;
  if (el.type === 'node') return `<osm><node ${attrs} lat="${el.lat}" lon="${el.lon}">${tagsXml(tags)}</node></osm>`;
  if (el.type === 'way') return `<osm><way ${attrs}>${el.nodes.map((n) => `<nd ref="${n}"/>`).join('')}${tagsXml(tags)}</way></osm>`;
  return `<osm><relation ${attrs}>${el.members.map((m) => `<member type="${m.type}" ref="${m.ref}" role="${xmlEsc(m.role)}"/>`).join('')}${tagsXml(tags)}</relation></osm>`;
}

// Tagy, které Kafemapa smí měnit. Nic jiného se do OSM neposílá (ani omylem).
export const EDITABLE = new Set(['opening_hours', 'internet_access', 'outdoor_seating', 'diet:vegan', 'diet:vegetarian', 'wheelchair', 'payment:cards', 'payment:credit_cards', 'payment:debit_cards']);

/**
 * Zapíše změny tagů do existujícího objektu v OSM jako samostatnou sadu změn.
 * @param {{ i: string, n: string }} cafe
 * @param {Record<string, string|null>} changes tag → nová hodnota (null = odebrat); jen z EDITABLE
 * @param {{ what: string, source: 'survey'|'website' }} meta what = co se mění, do komentáře sady změn
 * @returns {Promise<{ same?: true, changeset?: number, url?: string }>}
 */
export async function saveTags(cafe, changes, { what, source }) {
  for (const k of Object.keys(changes)) if (!EDITABLE.has(k)) throw new Error(`tag ${k} Kafemapa neupravuje`);
  const el = await fetchElement(cafe.i);
  if (el.visible === false) throw Object.assign(new Error('deleted'), { status: 410 });
  const tags = { ...el.tags };
  for (const [k, v] of Object.entries(changes)) v == null ? delete tags[k] : (tags[k] = v);
  if (Object.keys(changes).every((k) => (el.tags?.[k] ?? null) === (tags[k] ?? null))) return { same: true };

  const csXml = `<osm><changeset>${tagsXml({
    created_by: 'Kafemapa',
    comment: `${what}: ${el.tags?.name || cafe.n}`,
    hashtags: '#kafemapa',
    source: source === 'website' ? 'website' : 'survey',
    host: LIVE ? 'https://kafemapa.cz/' : location.origin + '/',
    locale: document.documentElement.lang || 'cs',
  })}</changeset></osm>`;
  const changeset = +(await (await api('/changeset/create', { method: 'PUT', body: csXml, auth: true })).text());
  try {
    await api(`/${el.type}/${el.id}`, { method: 'PUT', body: elementXml(el, tags, changeset), auth: true });
  } finally {
    await api(`/changeset/${changeset}/close`, { method: 'PUT', auth: true }).catch(() => {});
  }
  return { changeset, url: `${WEB}/changeset/${changeset}` };
}

/* ---------------- čekající úpravy ---------------- */

// Úpravu si pamatujeme v prohlížeči toho, kdo ji udělal, dokud ji nepřinese denní aktualizace dat.
const PENDING = (id) => `kafemapa:pending:${id}`;
export function rememberPending(osmId, value, url) {
  store.set(PENDING(osmId), JSON.stringify({ o: value, url, at: Date.now() }));
}
// Vybavení: data máme jen jako příznaky, takže poznámku necháme do příští denní aktualizace (~36 h).
const PENDING_AMEN = (id) => `kafemapa:pending-amenities:${id}`;
export function rememberPendingAmenities(osmId, url) {
  store.set(PENDING_AMEN(osmId), JSON.stringify({ url, at: Date.now() }));
}
export function pendingAmenities(osmId) {
  try {
    const p = JSON.parse(store.get(PENDING_AMEN(osmId)));
    if (!p) return null;
    if (Date.now() - p.at > 36 * 3_600_000) return void store.set(PENDING_AMEN(osmId), null), null;
    return p;
  } catch {
    return null;
  }
}

/** @returns {{ o: string, url: string, at: number } | null} čekající úprava, která ještě není v našich datech */
export function pendingEdit(osmId, currentValue) {
  try {
    const p = JSON.parse(store.get(PENDING(osmId)));
    if (!p) return null;
    // Data už úpravu obsahují, nebo je stará víc než týden (mezitím ji někdo změnil jinak) → zapomenout.
    if (p.o === currentValue || Date.now() - p.at > 7 * 86_400_000) return void store.set(PENDING(osmId), null), null;
    return p;
  } catch {
    return null;
  }
}
