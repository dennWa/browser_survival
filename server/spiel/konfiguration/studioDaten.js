/**
 * Vom Browser Survival Studio erzeugt (Item-Editor: Datei → Items, Loot & Rezepte). Bitte im Studio ändern, nicht von Hand.
 * Wird über die handgeschriebenen Dateien gelegt (die bleiben unverändert):
 *   gegenstaende  { id: { …Felder } }   neue Items bzw. geänderte Felder vorhandener Items (gegenstaende.js)
 *   icons         { id: 'vorhandenesIcon' }   Icon für neue Items (client/assets/atlas.json → items.icons)
 *   lootTabellen  { name: [{ id, gewicht }] }  ganze Tabellen, ersetzen/ergänzen lootTabellen.js
 *   rezepte       { id: { name, kategorie, zutaten, ergebnis, … } }  neue/geänderte Rezepte (rezepte.js)
 */
export const STUDIO_DATEN = Object.freeze({
  gegenstaende: {},
  icons: {},
  lootTabellen: {},
  rezepte: {},
});
