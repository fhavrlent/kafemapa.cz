// Návratová stránka přihlášení OSM (/osm/).
// Přihlášení v okně: předá kód oknu Kafemapy, které ho otevřelo, a zavře se (kód sám nic
// neumí, token z něj získá jen okno s ověřovačem PKCE).
// Přihlášení přesměrováním (okno zablokované): vymění kód za token a vrátí se na kavárnu.
const p = new URLSearchParams(location.search);
if (window.opener && window.opener !== window) {
  window.opener.postMessage({ type: 'kafemapa-osm', code: p.get('code'), state: p.get('state'), error: p.get('error') }, '*');
  window.close();
} else {
  import('./osm.js')
    .then(({ completeRedirect }) => completeRedirect(p))
    .then((back) => location.replace(back))
    .catch(() => (document.getElementById('msg').hidden = false));
}
