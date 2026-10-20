import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { kopie } from './karte.js';
import { suchNormal } from './katalog.js';

/**
 * Loot-Vorlagen (Editor 2.0, Schritt 6.3) – umgebungsfrei, getestet in tests/lootZonen.test.js.
 * Eine Vorlage = Loot-Einstellungen ohne Ort: { name, ordner, modus, eintraege, spawnChance?, respawnZeit?, max?, ort?, punkte? }.
 *   • eingebaut: die Loot-Tabellen des Spiels (`spiel:<name>`, schreibgeschützt, Modus Gewicht)
 *   • eigene: projektweit im Editor-Speicher (meta/lootVorlagen, ui/lootUi.js), IDs `v_<zeit36>`
 * Eine Zone trägt IMMER die volle Item-Liste (Spielformat unverändert). Verknüpft = zusätzlich `vorlage: <id>`; ändert sich die
 * Vorlage, ziehen `syncOps` alle verknüpften Zonen nach. Wer die Items einer verknüpften Zone selbst ändert, löst die Verknüpfung.
 */
export const VORLAGEN_FORMAT = 'browser-survival-lootvorlagen';
const FELDER = ['modus', 'eintraege', 'spawnChance', 'respawnZeit', 'max', 'ort', 'punkte'];

/** Eingebaute Vorlagen aus den Spiel-Tabellen */
export function eingebauteVorlagen() {
  return Object.fromEntries(Object.entries(LOOT_TABELLEN).map(([name, t]) => [`spiel:${name}`, { name, ordner: 'Spiel', modus: 'gewicht', eintraege: t.map((e) => ({ id: e.id, gewicht: e.gewicht })), eingebaut: true }]));
}

/** Vorlage aus einer Zone (nur Loot-Einstellungen; ohne Ort/Punkte, außer mitOrt) */
export function vorlageAusZone(zone, { name, ordner = '', mitOrt = false } = {}) {
  const v = { name: String(name || zone.name || 'Vorlage').slice(0, 60), ordner: String(ordner).slice(0, 60), modus: zone.modus ?? 'gewicht', eintraege: kopie(zone.eintraege ?? []) };
  for (const f of ['spawnChance', 'respawnZeit', 'max']) if (zone[f] !== undefined) v[f] = zone[f];
  if (mitOrt) {
    v.ort = zone.ort;
    v.punkte = zone.punkte;
  }
  return v;
}

/** Zone mit den Einstellungen einer Vorlage (verknuepft → `vorlage` gesetzt, sonst entfernt) */
export function zoneMitVorlage(zone, vorlage, id = null) {
  const neu = { ...zone };
  for (const f of ['spawnChance', 'respawnZeit', 'max']) delete neu[f];
  for (const f of FELDER) if (vorlage[f] !== undefined) neu[f] = kopie(vorlage[f]);
  if (id) neu.vorlage = id;
  else delete neu.vorlage;
  return neu;
}

/** Hat sich eine Zone gegenüber ihrer Vorlage verändert (Items/Modus/Chancen)? */
export function weichtAb(zone, vorlage) {
  return FELDER.some((f) => vorlage[f] !== undefined && JSON.stringify(zone[f]) !== JSON.stringify(vorlage[f])) || ['spawnChance', 'respawnZeit', 'max'].some((f) => vorlage[f] === undefined && zone[f] !== undefined);
}

/** Ops für eine Karte: alle mit `vorlage === id` verknüpften Zonen auf den Stand der Vorlage bringen */
export function syncOps(karte, id, vorlage) {
  return [...karte.s('lootZonen')].filter(([, z]) => z.vorlage === id).map(([k, z]) => ({ s: 'lootZonen', k, neu: zoneMitVorlage(z, vorlage, id) })).filter((op) => JSON.stringify(op.neu) !== JSON.stringify(karte.s('lootZonen').get(op.k)));
}

/** Ops: Verknüpfung lösen (bei allen Zonen einer Karte, die auf id zeigen – z. B. weil die Vorlage gelöscht wird) */
export function loeseOps(karte, id) {
  return [...karte.s('lootZonen')].filter(([, z]) => z.vorlage === id).map(([k, z]) => {
    const neu = { ...z };
    delete neu.vorlage;
    return { s: 'lootZonen', k, neu };
  });
}

/** Wie viele Zonen (über alle Karten) sind mit der Vorlage verknüpft? */
export function verknuepfungen(karten, id) {
  let n = 0;
  for (const k of karten) for (const z of k.s('lootZonen').values()) if (z.vorlage === id) n++;
  return n;
}

export const passtVorlage = (v, suche) => {
  const heu = suchNormal(`${v.name} ${v.ordner} ${(v.eintraege ?? []).map((e) => e.id).join(' ')}`);
  return suchNormal(suche).split(/\s+/).filter(Boolean).every((w) => heu.includes(w));
};

/** Neue ID für eine eigene Vorlage */
export const neueVorlagenId = (vorhanden, jetzt = Date.now()) => {
  let id = `v_${jetzt.toString(36)}`;
  for (let n = 2; vorhanden.has(id); n++) id = `v_${jetzt.toString(36)}_${n}`;
  return id;
};

/** Export-Datei (nur eigene Vorlagen) */
export function vorlagenDatei(vorlagen) {
  return { format: VORLAGEN_FORMAT, formatVersion: 1, vorlagen: Object.fromEntries(Object.entries(vorlagen).filter(([, v]) => !v.eingebaut)) };
}

/** Import: geprüft, Kollisionen bekommen neue IDs. @returns { vorlagen: {id: v}, anzahl } */
export function leseVorlagenDatei(eingabe, vorhanden = new Set()) {
  const j = typeof eingabe === 'string' ? JSON.parse(eingabe) : eingabe;
  if (j?.format !== VORLAGEN_FORMAT) throw new Error('Keine Loot-Vorlagen-Datei');
  const aus = {};
  const belegt = new Set(vorhanden);
  for (const [id, v] of Object.entries(j.vorlagen ?? {})) {
    if (!v || !Array.isArray(v.eintraege) || !['gewicht', 'chance'].includes(v.modus ?? 'gewicht')) continue;
    let neu = /^v_[0-9a-z_]{1,30}$/.test(id) ? id : neueVorlagenId(belegt);
    if (belegt.has(neu)) neu = neueVorlagenId(belegt);
    belegt.add(neu);
    aus[neu] = { ...vorlageAusZone(v, { name: v.name, ordner: v.ordner }), ...(v.ort ? { ort: v.ort } : {}), ...(v.punkte ? { punkte: v.punkte } : {}) };
  }
  return { vorlagen: aus, anzahl: Object.keys(aus).length };
}
