// Typy pro kontrolu JavaScriptu (npm run typecheck), do prohlížeče se nenahrávají.
import type * as Leaflet from 'leaflet';
import 'leaflet.markercluster';

declare global {
  // Leaflet se načítá jako klasický skript (assets/vendor/leaflet.js) a je globální.
  const L: typeof Leaflet;
  interface Window {
    L?: typeof Leaflet;
    /** ladicí přístup k datům mapy z konzole */
    kafemapa?: unknown;
  }
}
