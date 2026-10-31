import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BEHAELTER, BEHAELTER_TYPEN } from '../../gemeinsam/welt/behaelter.js';
import { EREIGNISSE } from '../../client/audio/eigeneSounds.js';
import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { ZONEN_EINSTELLUNGEN } from '../../server/spiel/karten/zonenEinstellungen.js';
import { katalog } from './katalog.js';
import { eingebautePrefabs } from './prefabs.js';
import { AKTIONEN_ANLEITUNG, AUSSEN } from './ausschnitt.js';

/**
 * Runde 26: KI-Karten-Anleitung – EINE Datei, die man einer fremden KI (ohne Projektwissen) zusammen mit einem Zonen-Export
 * (Editor: KI → „Ausschnitt für KI“) schickt. Kurz: worum es geht, wie eine Karte aufgebaut ist, Bauregeln, Antwortformat
 * (= kiImport.js, 1:1 im Editor einfügbar) und der KATALOG aller verfügbaren Kacheln/Objekte/Bauwerke/Behälter/Prefabs/Items/
 * Loot-Tabellen/eigenen 3D-Modelle/Sounds/Musik/Zonen-Werte.
 * Der Katalog wird aus den echten Registern erzeugt → `npm run ki:anleitung` schreibt editor/KI_KARTEN_ANLEITUNG.md,
 * tests/kiAnleitung.test.js schlägt fehl, wenn die Datei veraltet ist (neue Modelle/Sounds/Items landen so immer darin).
 * Umgebungsfrei (kein node:, kein DOM): Eingaben aus Dateien reicht der Aufrufer herein.
 * @param eigeneModelle  Inhalt von client/assets/eigene/index.json
 * @param musik  Inhalt von client/musik/musik.json ({ ordner: [dateien] })
 */
export function baueKiAnleitung({ eigeneModelle = [], musik = {} } = {}) {
  const k = katalog();
  const zeilen = [];
  const z = (...t) => zeilen.push(...t);
  const tabelle = (kopf, reihen) => {
    if (!reihen.length) return z('_(keine)_', '');
    z(`| ${kopf.join(' | ')} |`, `|${kopf.map(() => '---').join('|')}|`, ...reihen.map((r) => `| ${r.map((x) => String(x ?? '').replace(/\|/g, '/')).join(' | ')} |`), '');
  };

  z(
    '# Anleitung für KIs: Karten für „Browser Survival“ bauen',
    '',
    '> Diese Datei wird **automatisch erzeugt** (`npm run ki:anleitung`) – nicht von Hand ändern. Schicke sie zusammen mit einem',
    '> **Zonen-Export** aus dem Map-Editor (Menü KI → „Ausschnitt für KI“). Die KI antwortet mit EINEM JSON-Block, den man im',
    '> Editor unter KI → „KI-Antwort einfügen“ einfügt (Vorschau + Rückgängig).',
    '',
    '## 1. Worum es geht',
    'Ein Zombie-Survival-Spiel im Browser (Low-Poly-3D, Kamera schräg von oben). Die Welt besteht aus **Zonen** (Karten), z. B.',
    'Stadtrand oder Waldweg, verbunden über **Übergänge** am Rand. Spieler plündern Häuser (Loot in Räumen, Schränken, Kisten),',
    'kämpfen gegen Zombies, fällen Bäume, bauen Basen. Deine Aufgabe: einen markierten **Bereich** einer Zone gestalten oder ändern.',
    '',
    '## 2. So ist eine Karte aufgebaut',
    '- **Raster:** jede Kachel = 1 × 1 m (im Spiel 32 px). Koordinaten in Kacheln: `x` nach rechts (Osten), `y` nach unten (Süden), (0,0) = oben links.',
    '- **Boden** = ein Zeichen pro Kachel (siehe Katalog „Kacheln“). Wände `#`, Fenster `F` und Türen `T` sind ebenfalls Kacheln. Innenböden (`. : +`) machen eine Fläche zum **Innenraum** (bekommt im Spiel ein Dach).',
    '- **Objekte** (Möbel, Bäume, Autos, Deko, 3D-Modelle): `{ typ, x, y, b, h, drehung, blockiert, ebene }` – `x/y` = linke obere Ecke, `b/h` = Fußabdruck in Kacheln, Bruchteile erlaubt (frei platziert, z. B. 12.35). `drehung` in Grad (0/90/180/270 oder frei). `ebene: "oben"` = Baumkrone (man läuft darunter), `"boden"` = flach (Teppich).',
    '- **Bauwerke** (kartenfest, 1 Kachel): Zaun, Tor, Kiste, Bett, Werkbank, Lagerfeuer, Beet … (Katalog „Bauwerke“).',
    '- **Marker:** `S` Spieler-Start, `Z` Zombie-Spawn (nur draußen; `horde: true` = nachts), `a–z` Loot-Punkt eines Raums (Raum = Buchstabe mit Name + Loot-Tabelle).',
    '- **Loot:** Räume (`raeume.<buchstabe>.lootTabelle`) und Loot-Zonen (Rechteck mit Item-Chancen). Durchsuchbare Möbel (Katalog „Behälter“) haben eigenen Loot.',
    '- **Übergänge** (Rechteck am Kartenrand → andere Zone) und **Ankünfte** (wo man aus einer Nachbarzone ankommt).',
    '- **Gelände:** optionale Höhen je Kachel in Metern (`hoehen`); ein Sprung > 1 m zwischen Nachbarn = Klippe (unbegehbar).',
    '- **Bemalung:** Bodenfarbe je Kachel (Tönung über der Textur). **Klänge:** Punkt- oder Flächen-Geräuschquellen. **Zonen-Werte:** Wetter, Zombie-Dichte, Hasen, Loot, Musik (Katalog „Zonen-Werte“).',
    `- Im Export bedeutet \`${AUSSEN}\` = außerhalb der Zone (noch keine Karte; darf gestaltet werden, die Zone wächst beim Einfügen).`,
    '',
    '## 3. Bauregeln (darauf achten)',
    '- Nur im markierten Bereich ändern; geschützte Flächen (`geschuetzt`) nicht anfassen.',
    '- Nur IDs/Zeichen aus dem Katalog unten verwenden (unbekannte werden abgelehnt).',
    '- Häuser: geschlossene Wände (`#`/`F`), mindestens eine Tür `T`, Innenboden (`.` Fliesen, `:` Beton, `+` Holz) drinnen. Türen nicht zustellen (Kachel davor und dahinter frei).',
    '- Möbel nicht in Wände stellen, Wege frei lassen (mind. 1 Kachel breit, besser 2). Blockierende Objekte nicht auf Türen, Übergänge oder Ankünfte.',
    '- Zombie-Spawns nur draußen, nicht direkt am Spieler-Start. Loot passend zum Raum (Küche → `kueche`, Werkstatt → `werkstatt` …).',
    '- Natürlich wirken: Wege aus `&` Erde, `%` Kies oder `^` Pflaster, Wiesen `0`, Waldboden `;` unter Bäumen; Bäume nicht im Raster, sondern locker verteilt (Bruchteil-Koordinaten).',
    '- Abwechslung statt Kopien, aber nicht überladen: lieber wenige, gut platzierte Objekte.',
    '',
    '## 4. So antwortest du (WICHTIG)',
    'Antworte **nur mit EINEM ```json-Block** – eine Liste von Aktionen. Erste Aktion ist IMMER die `bereich`-Zeile aus dem Export (genau übernehmen).',
    'Mögliche Aktionen:',
    ...AKTIONEN_ANLEITUNG.map((t) => `- ${t}`),
    '',
    'Vollständiges Mini-Beispiel (kleine Hütte mit Kiesweg im Bereich x 20–31, y 10–19):',
    '```json',
    '[',
    '  {"aktion":"bereich","zone":"waldweg","x0":20,"x1":31,"y0":10,"y1":19,"pruefsumme":"<aus dem Export>"},',
    '  {"aktion":"kachel","x":22,"y":11,"b":6,"h":5,"zeichen":"#"},',
    '  {"aktion":"kachel","x":23,"y":12,"b":4,"h":3,"zeichen":"+"},',
    '  {"aktion":"kachel","x":24,"y":15,"zeichen":"T"},',
    '  {"aktion":"kachel","x":24,"y":16,"b":1,"h":4,"zeichen":"%"},',
    '  {"aktion":"raum","buchstabe":"h","name":"Hütte","lootTabelle":"huette"},',
    '  {"aktion":"marker","art":"loot","raum":"h","x":23,"y":12},',
    '  {"aktion":"setze","typ":"tisch","x":25,"y":12.4},',
    '  {"aktion":"bauwerk","typ":"kiste","x":26,"y":13},',
    '  {"aktion":"setze","typ":"baum","x":29.3,"y":11.6},',
    '  {"aktion":"marker","art":"zombie","x":30,"y":18}',
    ']',
    '```',
    'Häufige Ablehnungen: unbekannte ID, Koordinate außerhalb des Bereichs, Kachel schon belegt, Zombie auf Innenboden, Tür zugestellt.',
    '',
    '## 5. Katalog – was es alles gibt',
    '',
    '### Kacheln (Boden, Wände)',
  );
  tabelle(['Zeichen', 'Name', 'Kategorie', 'Eigenschaft'], k.filter((e) => e.art === 'kachel').map((e) => [`\`${e.zeichen}\``, e.name, e.kategorie, [e.blockiert ? 'blockiert' : '', e.innen ? 'innen' : ''].filter(Boolean).join(', ') || 'begehbar']));

  z('### Objekttypen (Aktion `setze`, Feld `typ`)');
  const objekte = new Map();
  for (const e of k) if (e.art === 'objekt' && !objekte.has(e.typ)) objekte.set(e.typ, e);
  tabelle(['typ', 'Name', 'Kategorie', 'b × h', 'Eigenschaft'], [...objekte.values()].map((e) => [`\`${e.typ}\``, e.name, e.kategorie, `${e.b} × ${e.h}`, [e.blockiert ? 'blockiert' : 'begehbar', e.ebene ? `ebene ${e.ebene}` : '', e.ressource ? 'abbaubar' : '', BEHAELTER_TYPEN[e.typ] ? 'durchsuchbar' : ''].filter(Boolean).join(', ')]));

  z('### Bauwerke (Aktion `bauwerk`, 1 Kachel)');
  tabelle(['typ', 'Name', 'Eigenschaft'], k.filter((e) => e.art === 'bauwerk').map((e) => [`\`${e.typ}\``, e.name.replace(' (Bauwerk)', ''), [e.blockiert ? 'blockiert' : 'begehbar', e.ebene ? `ebene ${e.ebene}` : ''].filter(Boolean).join(', ')]));

  z('### Durchsuchbare Behälter (Objekt-typ → Behälter mit eigenem Loot)');
  tabelle(['typ', 'Behälter', 'Plätze', 'Loot-Tabelle'], Object.entries(BEHAELTER_TYPEN).map(([typ, t]) => [`\`${typ}\``, BEHAELTER[t.art]?.name ?? t.art, BEHAELTER[t.art]?.plaetze ?? '', BEHAELTER[t.art]?.loot ?? '']));

  z('### Prefabs (Aktion `prefab`, fertige Gebäude/Flächen)');
  tabelle(['name', 'Beschreibung', 'Größe'], eingebautePrefabs().map((p) => [`\`${p.name}\``, p.beschreibung, `${p.vorlage.breite ?? p.vorlage.b ?? '?'} × ${p.vorlage.hoehe ?? p.vorlage.h ?? '?'}`]));

  z('### Loot-Tabellen (für Räume `lootTabelle` bzw. Loot-Zonen `tabelle`)');
  tabelle(['Tabelle', 'typische Items'], Object.entries(LOOT_TABELLEN).map(([n, l]) => [`\`${n}\``, [...l].sort((a, b) => b.gewicht - a.gewicht).slice(0, 8).map((e) => e.id).join(', ')]));

  z('### Items (für Loot-Zonen `items[].id`)');
  const nachKategorie = new Map();
  for (const [id, d] of Object.entries(GEGENSTAENDE)) {
    if (!nachKategorie.has(d.kategorie)) nachKategorie.set(d.kategorie, []);
    nachKategorie.get(d.kategorie).push(`\`${id}\` ${d.name}`);
  }
  tabelle(['Kategorie', 'Items'], [...nachKategorie].map(([kat, l]) => [kat, l.join(', ')]));

  z(`### Eigene 3D-Modelle (Aktion \`modell\`, Feld \`modell\` = Name ohne .glb; \`hoehe\` = Zielhöhe in m) – ${eigeneModelle.length} Stück`);
  tabelle(['modell', 'Name', 'Kategorie', 'Standardhöhe m', 'Fußabdruck m'], [...eigeneModelle].sort((a, b) => (a.kategorie ?? '').localeCompare(b.kategorie ?? '') || a.datei.localeCompare(b.datei)).map((m) => [`\`${m.datei.replace(/\.glb$/, '')}\``, m.name ?? '', m.kategorie ?? '', m.zielHoehe ?? '', m.masse ? `${m.masse.b} × ${m.masse.h}` : '']));

  z('### Sounds im Spiel (Info: was es schon gibt – Karten-Klänge setzt man im Editor)');
  const gruppen = new Map();
  for (const [name, [gruppe]] of Object.entries(EREIGNISSE)) {
    if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
    gruppen.get(gruppe).push(name);
  }
  tabelle(['Gruppe', 'Ereignisse'], [...gruppen].map(([g, l]) => [g, l.join(', ')]));

  z('### Musik-Ordner (Zonen-Wert `musik`)');
  tabelle(['Ordner', 'Stücke'], Object.entries(musik).map(([o, l]) => [`\`${o}\``, l.length]));

  z('### Zonen-Werte (Aktion `wert`, `pfad` = gruppe.name)');
  const werte = [];
  for (const [gruppe, g] of Object.entries(ZONEN_EINSTELLUNGEN)) for (const w of g.werte) werte.push([`\`${gruppe}.${w.name}\``, w.label, w.typ === 'haken' ? 'true/false' : `${w.min ?? ''}–${w.max ?? ''}${w.einheit ? ` ${w.einheit}` : ''}`, w.hilfe ?? '']);
  tabelle(['pfad', 'Bedeutung', 'Bereich', 'Hinweis'], werte);

  z('_Kachel-Zeichen gesamt: ' + Object.keys(KACHELN).map((c) => `\`${c}\``).join(' ') + '_', '');
  return zeilen.join('\n');
}
