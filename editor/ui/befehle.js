/**
 * Befehlsregister des Editors (Editor 2.0, Schritt 1.2): JEDE Aktion steht genau einmal hier –
 *   { id, name, symbol?, gruppe, kuerzel: ['Strg+Z', …], ausfuehren(ereignis?), verfuegbar?(), aktiv?(), hinweis?, inEingabe? }
 * Menüleiste, Schnellleiste, Werkzeugleiste, Kontextmenü, Tastatur, Hilfe und Befehlspalette (ui/hilfeUi.js) lesen nur daraus.
 * Eigene Tastenkürzel (Schritt 7.1): `belegeTaste(id, k)` (nimmt die Taste anderen Befehlen weg), `zuruecksetzen(id?)`;
 * gespeichert als { id: [kürzel] } über den eingespeisten `speicher` (Browser: localStorage `browserSurvival.editorKuerzel`).
 * `standard` = Kürzel aus der Befehlsliste. Kürzel-Schreibweise: 'Strg+Umschalt+Alt+Taste' (Strg = Ctrl oder ⌘).
 *   Tastennamen: Buchstaben groß ('V'), Ziffern, Zeichen ('[', '?', '+'), sowie Entf, Rück, Esc, Enter, Tab, Leertaste,
 *   Links/Rechts/Hoch/Runter, F1–F12. Umschalt zählt nur bei Buchstaben/Sondertasten (bei '?' steckt es im Zeichen).
 * Text-Standard (Feedback 6.5): Strg+C/X/V/A gehören in Eingabefeldern IMMER dem Browser (auch bei `inEingabe`-Befehlen),
 *   Strg+C/X/A außerdem, solange normaler Text markiert ist (z. B. eine KI-Antwort) – siehe `behandleTaste(e, { textMarkiert })`.
 *   `leise: true` am Befehl = ist er gerade nicht verfügbar, bleibt die Taste beim Browser (keine Meldung, z. B. Enter fürs Maßband).
 *   `istTextEingabe(el)` = Fokus in Text-/Zahlfeld, Textbereich, Auswahlliste, Schieberegler oder contenteditable
 *   (Häkchen/Knöpfe/Farbwähler zählen nicht – Kürzel wirken dort weiter).
 */
/** Kürzel, die in Textfeldern und bei markiertem Text dem Browser gehören (Kopieren, Ausschneiden, Einfügen, Alles markieren) */
export const TEXT_KUERZEL = Object.freeze(['Strg+C', 'Strg+X', 'Strg+V', 'Strg+A']);
const NICHT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** Liegt der Fokus in einem Feld, in dem getippt/gewählt wird? (Häkchen/Knöpfe zählen nicht) */
export function istTextEingabe(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NICHT_TEXT.has(String(el.type ?? 'text').toLowerCase());
}

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
  constructor({ beiNichtVerfuegbar = null, speicher = null } = {}) {
    /** id → Befehl */
    this.liste = new Map();
    this.beiNichtVerfuegbar = beiNichtVerfuegbar;
    this.hoerer = new Set();
    this.speicher = speicher;
    /** eigene Kürzel: id → [kürzel] (leere Liste = bewusst ohne Taste) */
    this.eigene = { ...(speicher?.lies?.() ?? {}) };
  }

  /** Befehle anmelden (spätere Anmeldung mit gleicher ID ersetzt); eigene Kürzel gelten sofort */
  registriere(...befehle) {
    for (const b of befehle) {
      const standard = b.kuerzel ?? [];
      const eigen = Array.isArray(this.eigene[b.id]) ? this.eigene[b.id] : null;
      this.liste.set(b.id, { gruppe: '', ...b, standard, kuerzel: eigen ?? standard });
    }
    this.melde();
  }

  /** Welcher andere Befehl hat dieses Kürzel? */
  konflikt(kuerzel, ausser = null) {
    for (const b of this.liste.values()) if (b.id !== ausser && b.kuerzel.includes(kuerzel)) return b;
    return null;
  }

  #setze(id, kuerzel) {
    const b = this.get(id);
    if (!b) return;
    b.kuerzel = kuerzel;
    if (JSON.stringify(kuerzel) === JSON.stringify(b.standard)) delete this.eigene[id];
    else this.eigene[id] = [...kuerzel];
  }

  #speichere() {
    this.speicher?.schreibe?.({ ...this.eigene });
    this.melde();
  }

  /**
   * Taste einem Befehl geben (ersetzt seine bisherigen Kürzel). Hat ein anderer Befehl dieselbe Taste, verliert er sie.
   * @returns der Befehl, dem die Taste weggenommen wurde (oder null)
   */
  belegeTaste(id, kuerzel) {
    if (!this.get(id) || !kuerzel) return null;
    const anderer = this.konflikt(kuerzel, id);
    if (anderer) this.#setze(anderer.id, anderer.kuerzel.filter((k) => k !== kuerzel));
    this.#setze(id, [kuerzel]);
    this.#speichere();
    return anderer;
  }

  /** Taste(n) eines Befehls entfernen */
  entferneKuerzel(id) {
    this.#setze(id, []);
    this.#speichere();
  }

  /** Standard-Kürzel wiederherstellen (ohne id: alle). Nimmt die Tasten ggf. anderen eigenen Belegungen wieder weg. */
  zuruecksetzen(id = null) {
    const ids = id ? [id] : Object.keys(this.eigene);
    for (const i of ids) {
      const b = this.get(i);
      if (!b) {
        delete this.eigene[i];
        continue;
      }
      for (const k of b.standard) {
        const anderer = this.konflikt(k, i);
        if (anderer && this.eigene[anderer.id]) this.#setze(anderer.id, anderer.kuerzel.filter((x) => x !== k));
      }
      this.#setze(i, [...b.standard]);
    }
    this.#speichere();
  }

  /** Hat der Befehl eigene (geänderte) Kürzel? */
  geaendert(id) {
    return Object.hasOwn(this.eigene, id);
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
   * Tastendruck verarbeiten. In Eingabefeldern nur Befehle mit `inEingabe: true` (z. B. Strg+S) – Strg+C/X/V/A dort nie.
   * textMarkiert = normaler Text auf der Seite markiert → Strg+C/X/A bleiben beim Browser.
   * @returns true, wenn ein Befehl die Taste übernommen hat (preventDefault ist dann schon gesetzt)
   */
  behandleTaste(e, { inEingabe = false, textMarkiert = false } = {}) {
    const k = tastenKuerzel(e);
    if (!k) return false;
    if (TEXT_KUERZEL.includes(k) && (inEingabe || (textMarkiert && k !== 'Strg+V'))) return false;
    const b = this.finde(k);
    if (!b || (inEingabe && !b.inEingabe)) return false;
    if (b.leise && b.verfuegbar && !b.verfuegbar()) return false;
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
