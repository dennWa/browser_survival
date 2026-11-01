/**
 * Befehlsschicht des Studios: jede Aktion der Oberfläche (Menü, Werkzeugleiste, Tastenkürzel, Befehlspalette Strg+K)
 * ist ein registrierter Befehl { id, titel, gruppe, kuerzel?, icon?, aktiv?(), ausfuehren(args) }.
 * Kartenänderungen selbst laufen über Dokument.aendere (Undo); KI/MCP nutzen dieselben Aktionen (kern/kiAusfuehren.js).
 * Umgebungsfrei (Tastatur-Abgleich bekommt ein Ereignis-ähnliches Objekt).
 */
export class Befehle {
  constructor() {
    this.liste = new Map();
    this.beobachter = new Set();
  }

  registriere(...befehle) {
    for (const b of befehle) {
      if (this.liste.has(b.id)) throw new Error(`Befehl „${b.id}“ doppelt`);
      this.liste.set(b.id, b);
    }
  }

  hole(id) {
    return this.liste.get(id) ?? null;
  }

  istAktiv(id) {
    const b = this.hole(id);
    return !!b && (b.aktiv ? b.aktiv() : true);
  }

  async aus(id, args) {
    const b = this.hole(id);
    if (!b) throw new Error(`Unbekannter Befehl „${id}“`);
    if (b.aktiv && !b.aktiv()) return undefined;
    const r = await b.ausfuehren(args);
    for (const f of this.beobachter) f(id);
    return r;
  }

  /** Befehl zum Tastendruck (kuerzel z. B. 'Strg+Z', 'Strg+Umschalt+Z', 'F5', 'W') */
  zuTaste(e) {
    const taste = normaleTaste(e);
    for (const b of this.liste.values()) if (b.kuerzel && [].concat(b.kuerzel).includes(taste)) return b;
    return null;
  }

  /** Befehlspalette: Suche über Titel/Gruppe */
  suche(text) {
    const t = text.trim().toLowerCase();
    return [...this.liste.values()].filter((b) => !b.versteckt && (!t || `${b.gruppe} ${b.titel}`.toLowerCase().includes(t)));
  }
}

/** KeyboardEvent → 'Strg+Umschalt+Z' */
export function normaleTaste(e) {
  const teile = [];
  if (e.ctrlKey || e.metaKey) teile.push('Strg');
  if (e.altKey) teile.push('Alt');
  if (e.shiftKey) teile.push('Umschalt');
  let k = e.key;
  if (k === ' ') k = 'Leertaste';
  else if (k === 'Delete') k = 'Entf';
  else if (k === 'Escape') k = 'Esc';
  else if (k.length === 1) k = k.toUpperCase();
  teile.push(k);
  return teile.join('+');
}
