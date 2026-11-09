/**
 * Runde 47: Tastenbelegung an EINER Stelle – Standard + eigene Belegung (⚙ Einstellungen → Tastenbelegung,
 * localStorage `browserSurvival.tasten` = { aktion: [code, code?] } nur für geänderte Aktionen).
 *
 * Codes = `KeyboardEvent.code` (physische Taste → WASD klappt auf QWERTZ/QWERTY/AZERTY) bzw. `Maus1|Maus3|Maus4`
 * (mittlere Maustaste, Seitentasten – Links/Rechts bleiben Angriff/Kontext). Je Aktion bis zu 2 Tasten.
 * Eine Taste gehört immer nur EINER Aktion: setzeTaste() nimmt sie der bisherigen weg (Rückgabe sagt, welcher).
 * `eingabe.js` fragt `TASTEN[aktion]` bei jedem Tastendruck neu ab → Änderungen wirken sofort.
 */
const SPEICHER = 'browserSurvival.tasten';

/** Werkseinstellung. ⚠ Neue Aktion: hier + BELEGBAR (Name/Gruppe) + `eingabe.beiTaste(aktion, …)` in main.js. */
export const STANDARD_TASTEN = Object.freeze({
  oben: ['KeyW', 'ArrowUp'],
  unten: ['KeyS', 'ArrowDown'],
  links: ['KeyA', 'ArrowLeft'],
  rechts: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  ducken: ['KeyZ'], // Y auf QWERTZ (unten links) – Ducken/Schleichen an/aus
  autorun: ['Backquote'], // ^ (deutsche Tastatur)
  angriff: ['Space'], // zusätzlich: linke Maustaste
  nachladen: ['KeyR'],
  aufheben: ['KeyE'], // Aufheben / Abbauen / Werkbank / Schlafen – je nachdem, was in der Nähe ist
  tuer: ['KeyF'], // Lagerfeuer an/aus (Name historisch)
  sitzen: ['Quote'], // Ä (physisch die '-Taste)
  fallenlassen: ['KeyQ'],
  licht: ['KeyL'],
  kofferraum: ['KeyG'], // Auto-Menü: Zustand + Kofferraum
  bauen: ['KeyB'], // Bau-Modus – Admin: Umschalt+B = Flugmodus
  abriss: ['KeyX'],
  gebiet: ['KeyN'], // Baugebiet-Ring (bis Runde 46: V)
  inventar: ['Tab'],
  karte: ['KeyM', 'KeyK'],
  skills: ['KeyU'],
  tagebuch: ['KeyJ'],
  spielerliste: ['KeyI'],
  chat: ['KeyT'],
  sprechen: ['KeyV'], // Sprachchat in der Nähe (halten) – bis Runde 46: C (kollidierte mit der Ego-Ansicht)
  funken: ['KeyY'], // Z auf QWERTZ – über das Funkgerät sprechen (halten)
  funkgeraet: ['BracketLeft'], // Ü – Funkgerät einstellen (an/aus, Frequenz)
  emotes: ['Semicolon'], // Ö – Emoji-Auswahl
  ego: ['KeyC'], // Ich-Perspektive an/aus
  wiederbeleben: ['Enter'],
  admin: ['KeyP'],
  ton: [], // Ton an/aus (im ⚙-Menü)
  menue: ['Escape'],
  debug: ['F3'],
});

/** Was im Einstellungsfenster belegbar ist (Reihenfolge = Anzeige). Esc, F3 und 1–0 bleiben fest. */
export const BELEGBAR = Object.freeze([
  { gruppe: 'Bewegung', aktionen: [['oben', 'Vorwärts'], ['unten', 'Rückwärts'], ['links', 'Links'], ['rechts', 'Rechts'], ['sprint', 'Sprinten (halten)'], ['ducken', 'Ducken / Schleichen'], ['autorun', 'Autorun'], ['sitzen', 'Hinsetzen']] },
  { gruppe: 'Kampf & Aktionen', aktionen: [['angriff', 'Angriff'], ['nachladen', 'Nachladen'], ['aufheben', 'Benutzen / Aufheben'], ['tuer', 'Lagerfeuer an/aus'], ['fallenlassen', 'Fallen lassen'], ['licht', 'Taschenlampe'], ['kofferraum', 'Auto-Menü / Kofferraum'], ['bauen', 'Bau-Modus'], ['abriss', 'Abriss (Bau-Modus)'], ['gebiet', 'Baugebiet zeigen']] },
  { gruppe: 'Kommunikation', aktionen: [['chat', 'Chat'], ['sprechen', 'Sprechen – Nähe (halten)'], ['funken', 'Funken (halten)'], ['funkgeraet', 'Funkgerät einstellen'], ['emotes', 'Emotes']] },
  { gruppe: 'Fenster & Ansicht', aktionen: [['inventar', 'Inventar'], ['karte', 'Karte'], ['skills', 'Fähigkeiten'], ['tagebuch', 'Tagebuch'], ['spielerliste', 'Spielerliste'], ['ego', 'Ich-Perspektive'], ['wiederbeleben', 'Neu starten (tot)'], ['admin', 'Admin-Menü']] },
]);

/** Tasten, die nie umbelegt werden können (Menü, Debug, Schnellleiste). */
export const RESERVIERT = Object.freeze(['Escape', 'F3', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'F5', 'F11', 'F12']);

/** Aktuelle Belegung (veränderlich – eingabe.js liest bei jedem Tastendruck). */
export const TASTEN = {};
const hoerer = new Set();

function speicher() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // privates Fenster / Node
  }
}

function istCode(code) {
  return typeof code === 'string' && /^(?:[A-Z][A-Za-z0-9]{1,24}|Maus[134])$/.test(code);
}

/** Belegung aus dem Speicher laden (beim Start; Tests geben ein eigenes Objekt rein). */
export function ladeBelegung(roh = null) {
  for (const k of Object.keys(TASTEN)) delete TASTEN[k];
  for (const [aktion, codes] of Object.entries(STANDARD_TASTEN)) TASTEN[aktion] = [...codes];
  let eigene = roh;
  if (!eigene) {
    try {
      eigene = JSON.parse(speicher()?.getItem(SPEICHER) ?? 'null');
    } catch {
      eigene = null;
    }
  }
  if (!eigene || typeof eigene !== 'object') return TASTEN;
  const belegbar = new Set(BELEGBAR.flatMap((g) => g.aktionen.map(([a]) => a)));
  for (const [aktion, codes] of Object.entries(eigene)) {
    if (!belegbar.has(aktion) || !Array.isArray(codes)) continue;
    TASTEN[aktion] = codes.filter((c) => istCode(c) && !RESERVIERT.includes(c)).slice(0, 2);
  }
  // Doppelte Belegung aus alten/kaputten Daten: eigene Belegung gewinnt, Standard verliert die Taste
  for (const aktion of Object.keys(eigene)) {
    for (const code of TASTEN[aktion] ?? []) {
      for (const [andere, liste] of Object.entries(TASTEN)) if (andere !== aktion && liste.includes(code)) TASTEN[andere] = liste.filter((c) => c !== code);
    }
  }
  return TASTEN;
}

function speichere() {
  const geaendert = {};
  for (const [aktion, codes] of Object.entries(TASTEN)) if (JSON.stringify(codes) !== JSON.stringify(STANDARD_TASTEN[aktion] ?? [])) geaendert[aktion] = codes;
  try {
    speicher()?.setItem(SPEICHER, JSON.stringify(geaendert));
  } catch {
    /* egal */
  }
  for (const fn of hoerer) fn();
}

/**
 * Taste `code` als `platz`-te Taste (0|1) der Aktion setzen; null = Platz leeren.
 * @returns { ok, verdraengt?: aktion, fehler?: text }
 */
export function setzeTaste(aktion, platz, code) {
  if (!Object.hasOwn(STANDARD_TASTEN, aktion)) return { ok: false, fehler: 'Unbekannte Aktion' };
  const liste = [...(TASTEN[aktion] ?? [])];
  if (code === null) {
    liste.splice(platz, 1);
    TASTEN[aktion] = liste;
    speichere();
    return { ok: true };
  }
  if (!istCode(code)) return { ok: false, fehler: 'Diese Taste geht nicht' };
  if (RESERVIERT.includes(code)) return { ok: false, fehler: `${tastenName(code)} ist fest vergeben` };
  let verdraengt = null;
  for (const [andere, codes] of Object.entries(TASTEN)) {
    if (andere === aktion || !codes.includes(code)) continue;
    TASTEN[andere] = codes.filter((c) => c !== code);
    verdraengt = andere;
  }
  const ohne = liste.filter((c) => c !== code);
  ohne.splice(Math.min(platz, ohne.length), platz < ohne.length ? 1 : 0, code);
  TASTEN[aktion] = ohne.slice(0, 2);
  speichere();
  return { ok: true, verdraengt };
}

/** Alles auf Werkseinstellung (oder nur eine Aktion). */
export function setzeZurueck(aktion = null) {
  if (aktion) TASTEN[aktion] = [...(STANDARD_TASTEN[aktion] ?? [])];
  else ladeBelegung({});
  // Werkseinstellung einer Aktion kann eine eigene Belegung einer anderen doppeln → die andere verliert sie
  if (aktion) for (const code of TASTEN[aktion]) for (const [andere, codes] of Object.entries(TASTEN)) if (andere !== aktion && codes.includes(code)) TASTEN[andere] = codes.filter((c) => c !== code);
  speichere();
}

/** Alle Aktionen, auf denen `code` liegt (normal genau eine). */
export function aktionenFuer(code) {
  const treffer = [];
  for (const [aktion, codes] of Object.entries(TASTEN)) if (codes.includes(code)) treffer.push(aktion);
  return treffer;
}

/** fn() nach jeder Änderung (Hinweistexte im HUD aktualisieren). @returns abmelden() */
export function beiAenderung(fn) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

const NAMEN = {
  Space: 'Leertaste', Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', Escape: 'Esc', CapsLock: 'Feststell', ShiftLeft: 'Umschalt', ShiftRight: 'Umschalt rechts',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '^', Quote: 'Ä', Semicolon: 'Ö', BracketLeft: 'Ü', BracketRight: '+',
  Backslash: '#', IntlBackslash: '<', Minus: 'ß', Equal: '´', Comma: ',', Period: '.', Slash: '-', Insert: 'Einfg', Delete: 'Entf', Home: 'Pos1', End: 'Ende',
  PageUp: 'Bild ↑', PageDown: 'Bild ↓', NumpadEnter: 'Num-Enter', Maus1: 'Maus Mitte', Maus3: 'Maus 4', Maus4: 'Maus 5',
};
let layout = null; // Chrome: echte Beschriftung der Tastatur (navigator.keyboard.getLayoutMap)
try {
  globalThis.navigator?.keyboard?.getLayoutMap?.().then((m) => {
    layout = m;
    for (const fn of hoerer) fn();
  }).catch(() => {});
} catch {
  /* egal */
}

/** Lesbarer Name einer Taste – auf deutscher Tastatur z. B. KeyY → „Z“, Semicolon → „Ö“. */
export function tastenName(code) {
  if (!code) return '–';
  const echt = layout?.get?.(code);
  if (echt && echt.trim() && /^Key|^Digit|^Semicolon$|^Quote$|^BracketLeft$|^Backquote$/.test(code)) return echt.length === 1 ? echt.toUpperCase() : echt;
  if (NAMEN[code]) return NAMEN[code];
  if (/^Key[A-Z]$/.test(code)) return { KeyY: 'Z', KeyZ: 'Y' }[code] ?? code.slice(3); // ohne Layout-Info: QWERTZ annehmen
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

/** Kurzer Hinweis zur ersten Taste einer Aktion, z. B. „V“ (oder „–“, wenn nichts belegt ist). */
export function tasteVon(aktion) {
  return tastenName(TASTEN[aktion]?.[0]);
}

ladeBelegung();
