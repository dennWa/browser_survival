/**
 * Befehlsregister des Editors (Editor 2.0, Schritt 1.2): JEDE Aktion steht genau einmal hier –
 *   { id, name, symbol?, gruppe, kuerzel: ['Strg+Z', …], ausfuehren(ereignis?), verfuegbar?(), aktiv?(), hinweis?, inEingabe? }
 * Menüleiste, Schnellleiste, Werkzeugleiste, Kontextmenü und Tastatur lesen nur daraus (später auch Hilfe/Befehlspalette
 * und eigene Tastenkürzel, Schritt 7.1). Kürzel-Schreibweise: 'Strg+Umschalt+Alt+Taste' (Strg = Ctrl oder ⌘).
 *   Tastennamen: Buchstaben groß ('V'), Ziffern, Zeichen ('[', '?', '+'), sowie Entf, Rück, Esc, Enter, Tab, Leertaste,
 *   Links/Rechts/Hoch/Runter, F1–F12. Umschalt zählt nur bei Buchstaben/Sondertasten (bei '?' steckt es im Zeichen).
 */
const SONDER = { ' ': 'Leertaste', arrowleft: 'Links', arrowright: 'Rechts', arrowup: 'Hoch', arrowdown: 'Runter', delete: 'Entf', backspace: 'Rück', escape: 'Esc', enter: 'Enter', tab: 'Tab', home: 'Pos1', end: 'Ende', pageup: 'BildHoch', pagedown: 'BildRunter', insert: 'Einfg' };
const MODIFIKATOREN = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

/** KeyboardEvent → Kürzel-Text (oder null bei reinen Modifikatortasten) */
export function tastenKuerzel(e) {
  const taste = e.key;
  if (!taste || MODIFIKATOREN.has(taste)) return null;
  let name;
  let mitUmschalt;
  if (SONDER[taste.toLowerCase()]) {
    name = SONDER[taste.toLowerCase()];
    mitUmschalt = true;
  } else if (/^F\d{1,2}$/.test(taste)) {
    name = taste;
    mitUmschalt = true;
  } else if (taste.length === 1 && /[a-zäöü0-9]/i.test(taste)) {
    name = taste.toUpperCase();
    mitUmschalt = /[a-zäöü]/i.test(taste);
  } else if (e.altKey && /^(Key[A-Z]|Digit\d)$/.test(e.code ?? '')) {
    // macOS: Alt+Taste liefert Sonderzeichen → physische Taste nehmen
    name = e.code.replace(/^Key|^Digit/, '');
    mitUmschalt = true;
  } else {
    name = taste;
    mitUmschalt = false;
  }
  const teile = [];
  // AltGr (deutsche Tastatur: [ ] { } @ …) meldet Windows als Strg+Alt → bei Zeichen nicht als Kürzel-Modifikator zählen
  const altGr = !mitUmschalt && e.getModifierState?.('AltGraph');
  if ((e.ctrlKey || e.metaKey) && !altGr) teile.push('Strg');
  if (e.altKey && !altGr) teile.push('Alt');
  if (e.shiftKey && mitUmschalt) teile.push('Umschalt');
  teile.push(name);
  return teile.join('+');
}

/** Kürzel für die Anzeige (Mac: ⌘ statt Strg) */
export function kuerzelText(k) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return mac ? k.replace(/Strg\+/g, '⌘').replace(/Umschalt\+/g, '⇧').replace(/Alt\+/g, '⌥') : k;
}

export class Befehle {
  constructor({ beiNichtVerfuegbar = null } = {}) {
    /** id → Befehl */
    this.liste = new Map();
    this.beiNichtVerfuegbar = beiNichtVerfuegbar;
    this.hoerer = new Set();
  }

  /** Befehle anmelden (spätere Anmeldung mit gleicher ID ersetzt) */
  registriere(...befehle) {
    for (const b of befehle) this.liste.set(b.id, { gruppe: '', kuerzel: [], ...b });
    this.melde();
  }

  get(id) {
    return this.liste.get(id) ?? null;
  }

  verfuegbar(id) {
    const b = this.get(id);
    return !!b && (b.verfuegbar ? !!b.verfuegbar() : true);
  }

  aktiv(id) {
    const b = this.get(id);
    return !!b?.aktiv?.();
  }

  /** Befehl ausführen (mit Grund-Meldung, wenn gerade nicht möglich). @returns true wenn ausgeführt */
  fuehreAus(id, ereignis = null) {
    const b = this.get(id);
    if (!b) return false;
    if (b.verfuegbar && !b.verfuegbar()) {
      this.beiNichtVerfuegbar?.(b);
      return false;
    }
    b.ausfuehren(ereignis);
    this.melde();
    return true;
  }

  /** Erstes Kürzel eines Befehls (für Menüs/Tooltips) */
  kuerzel(id) {
    return this.get(id)?.kuerzel?.[0] ?? '';
  }

  /** Befehl zu einem Kürzel */
  finde(kuerzel) {
    for (const b of this.liste.values()) if (b.kuerzel.includes(kuerzel)) return b;
    return null;
  }

  /**
   * Tastendruck verarbeiten. In Eingabefeldern nur Befehle mit `inEingabe: true` (z. B. Strg+S).
   * @returns true, wenn ein Befehl die Taste übernommen hat (preventDefault ist dann schon gesetzt)
   */
  behandleTaste(e, { inEingabe = false } = {}) {
    const k = tastenKuerzel(e);
    if (!k) return false;
    const b = this.finde(k);
    if (!b || (inEingabe && !b.inEingabe)) return false;
    e.preventDefault();
    this.fuehreAus(b.id, e);
    return true;
  }

  /** Änderungen (verfügbar/aktiv) an Menüs & Leisten weitergeben */
  bei(f) {
    this.hoerer.add(f);
    return () => this.hoerer.delete(f);
  }

  melde() {
    for (const f of this.hoerer) f();
  }
}
