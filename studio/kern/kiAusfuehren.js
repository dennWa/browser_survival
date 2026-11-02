import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { katalog, passtZurSuche } from '../../editor/kern/katalog.js';
import { spielordnerListe } from '../../editor/kern/spielordner.js';
import { validiere } from '../../editor/kern/validierung.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { kiWerkzeug, KI_REGELN } from './kiWerkzeuge.js';
import * as A from './aktionen.js';
import * as B from './bauhilfen.js';
import { laufweg, balance } from './analyse.js';
import { kiModellWerkzeuge } from './kiModelle.js';
import { kiAudioWerkzeuge } from './kiAudio.js';

/**
 * Führt KI-Werkzeuge (kiWerkzeuge.js) im Studio-Fenster aus – für MCP (Claude Desktop/Code …) UND den eingebauten
 * Assistenten. Ändernde Werkzeuge laufen über Dokument.aendere → je Aufruf ein Undo-Schritt „KI: …“, sofort sichtbar.
 * Ergebnis: { ok, text?, daten?, bild? (PNG base64) }.
 * @param studio { dok, ansicht, vorlagen(), zonenListe(), oeffneZone(id), neueZone(felder), meldeKi(quelle) }
 */
export function erstelleKiAusfuehrer(studio) {
  const { dok } = studio;
  const karte = () => {
    if (!dok.karte) throw new Error('Keine Zone geöffnet – zuerst zone_oeffnen oder zone_neu');
    return dok.karte;
  };
  const aendere = (name, ops) => {
    const fertig = dok.aendere(`KI: ${name}`, ops);
    // Gesperrte Ebene (Dokument filtert) → ehrlich melden statt „gesetzt“
    if (ops.length && !fertig.length && ops.some((op) => op.neu !== undefined)) {
      const gesperrt = Object.entries(dok.ebenen ?? {}).filter(([, e]) => e.gesperrt || e.sichtbar === false).map(([id]) => id);
      if (gesperrt.length) throw new Error(`Nichts geändert – gesperrte/ausgeblendete Ebenen: ${gesperrt.join(', ')}`);
    }
    return fertig.length;
  };
  const ok = (text, daten) => ({ ok: true, text, ...(daten !== undefined ? { daten } : {}) });

  const W = {
    anleitung: () => ok(`${KI_REGELN}\nLoot-Tabellen: ${Object.keys(LOOT_TABELLEN).join(', ')}.\nItems für Spawnpunkte: katalog mit suche=Item-Name hilft nicht – nimm IDs wie konservendose, wasserflasche, verband, apfel, holz.`),
    zonen_liste: async () => ok(null, await studio.zonenListe()),
    zone_oeffnen: async ({ id }) => {
      await studio.oeffneZone(id);
      return ok(`Zone „${id}“ ist offen (${dok.karte.breite} × ${dok.karte.hoehe}).`);
    },
    zone_neu: async (a) => {
      studio.neueZone({ id: a.id, name: a.name, breite: Math.max(20, Math.min(1500, Math.round(a.breite))), hoehe: Math.max(20, Math.min(1500, Math.round(a.hoehe))), boden: a.boden && KACHELN[a.boden] ? a.boden : ',' });
      return ok(`Neue Zone „${a.id}“ angelegt und geöffnet.`);
    },
    zone_info: () => {
      const k = karte();
      const marker = [...k.s('marker').values()];
      const zaehle = (art) => marker.filter((m) => m.art === art).length;
      const legende = Object.entries(KACHELN).map(([z, d]) => `${z}=${d.name}`).join(' ');
      return ok(null, {
        id: k.id, name: k.name, breite: k.breite, hoehe: k.hoehe,
        objekte: k.s('objekte').size, raeume: Object.fromEntries([...k.s('raeume')].map(([b, r]) => [b, r.name])), spielerStart: zaehle('start'), zombieSpawns: zaehle('zombie'), lootPunkte: zaehle('loot'),
        spawnpunkte: k.s('spawnpunkte').size, lootZonen: k.s('lootZonen').size, uebergaenge: [...k.s('uebergaenge').values()].map((u) => ({ ziel: u.ziel, ankunft: u.ankunft, x: u.x, y: u.y, b: u.b, h: u.h })), ankuenfte: Object.fromEntries(k.s('ankuenfte')), klaenge: k.s('klaenge').size, legende,
      });
    },
    zone_ausschnitt: ({ x, y, b, h }) => {
      const k = karte();
      const r = A.imFeld(k, { x, y, b: Math.min(100, b), h: Math.min(70, h) });
      if (!r) throw new Error('Ausschnitt liegt außerhalb der Zone');
      const zeilen = [];
      for (let yy = r.y; yy < r.y + r.h; yy++) {
        let z = '';
        for (let xx = r.x; xx < r.x + r.b; xx++) {
          const m = k.markerAn(xx, yy);
          if (m) z += m.art === 'start' ? 'S' : m.art === 'zombie' ? 'Z' : m.raum;
          else if (k.objektBei(xx + 0.5, yy + 0.5)) z += 'o';
          else z += k.kachelAn(xx, yy);
        }
        zeilen.push(z);
      }
      return ok(`Ausschnitt x ${r.x}–${r.x + r.b - 1}, y ${r.y}–${r.y + r.h - 1} (erste Zeile = y ${r.y}):\n${zeilen.join('\n')}`);
    },
    katalog: ({ suche = '', kategorie = '' }) => {
      const treffer = [];
      for (const e of katalog()) {
        if (!['kachel', 'objekt', 'bauwerk'].includes(e.art)) continue;
        if (e.id.includes('@')) continue;
        if (kategorie && e.kategorie !== kategorie) continue;
        if (suche && !passtZurSuche(e, suche)) continue;
        treffer.push({ id: e.id, name: e.name, kategorie: e.kategorie, ...(e.b ? { b: e.b, h: e.h } : {}), ...(e.blockiert ? { blockiert: true } : {}) });
      }
      for (const m of spielordnerListe?.() ?? []) {
        const name = `${m.name ?? ''} ${m.stem ?? ''}`.toLowerCase();
        if (suche && !name.includes(suche.toLowerCase())) continue;
        treffer.push({ id: `modell:${m.stem}`, name: m.name, kategorie: `Modell (${m.kategorie})` });
      }
      for (const v of studio.vorlagen()) if (!suche || v.name.toLowerCase().includes(suche.toLowerCase())) treffer.push({ id: `vorlage:${v.id}`, name: v.name, kategorie: 'Vorlage', b: v.vorlage.b, h: v.vorlage.h });
      return ok(null, { anzahl: treffer.length, treffer: treffer.slice(0, 80) });
    },
    boden_malen: ({ zeichen, x, y, b, h, waende_ueberschreiben }) => ok(`${aendere('Boden', A.rechteckOps(karte(), { x, y, b, h }, zeichen, { waendeSchuetzen: !waende_ueberschreiben }))} Kacheln gesetzt.`),
    wand_ziehen: ({ x0, y0, x1, y1, art = 'wand' }) => ok(`${aendere(art === 'tuer' ? 'Tür' : 'Wand', A.wandOps(karte(), { x: x0, y: y0 }, { x: x1, y: y1 }, art))} Kacheln gesetzt.`),
    raum_bauen: (a) => {
      const { ops, raum } = A.raumOps(karte(), { x: a.x, y: a.y, b: a.b, h: a.h, boden: a.boden ?? '.', tuer: a.tuer ?? 's', name: a.name, lootTabelle: a.lootTabelle });
      aendere(`Raum ${a.name ?? ''}`.trim(), ops);
      return ok(`Raum gebaut${raum ? ` (Raum ${raum}, Loot ${a.lootTabelle ?? 'wohnung'})` : ''}.`);
    },
    objekt_platzieren: ({ id, x, y, drehung = 0, skalierung = 1 }) => {
      const k = karte();
      if (id.startsWith('vorlage:')) {
        const v = studio.vorlagen().find((t) => t.id === id.slice(8));
        if (!v) throw new Error(`Vorlage „${id.slice(8)}“ gibt es nicht`);
        const { ops, weggelassen } = A.verknuepfteVorlageOps(k, v.id, v.vorlage, x, y);
        aendere(`Vorlage ${v.name}`, ops);
        return ok(`Vorlage eingesetzt${weggelassen ? ` (${weggelassen} Teile außerhalb weggelassen)` : ''}.`);
      }
      const r = A.objektOps(k, id, x, y, { drehung, skalierung });
      aendere(`${id} gesetzt`, r.ops);
      const o = k.s(r.sammlung).get(r.id);
      return ok(`Gesetzt: ID ${r.id}${o?.b ? `, Grundfläche ${o.b} × ${o.h}` : ''}.`);
    },
    objekte_auflisten: ({ x, y, b, h }) => {
      const k = karte();
      const r = x === undefined ? null : { x, y, b: b ?? 1, h: h ?? 1 };
      const liste = [...k.s('objekte')].filter(([, o]) => !r || (o.x + o.b > r.x && o.x < r.x + r.b && o.y + o.h > r.y && o.y < r.y + r.h)).slice(0, 300);
      return ok(null, liste.map(([id, o]) => ({ id, typ: o.typ, x: o.x, y: o.y, b: o.b, h: o.h, ...(o.drehung ? { drehung: o.drehung } : {}), ...(o.skalierung ? { skalierung: o.skalierung } : {}) })));
    },
    objekt_aendern: ({ id, x, y, drehung, skalierung, name }) => {
      const k = karte();
      let o = k.s('objekte').get(id);
      if (!o) throw new Error(`Objekt ${id} gibt es nicht`);
      if (skalierung !== undefined) o = A.skaliertesObjekt(o, skalierung);
      if (drehung !== undefined) o = A.gedrehtesObjekt(o, drehung);
      o = { ...o, ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}), ...(name !== undefined ? { name } : {}) };
      aendere('Objekt ändern', [{ s: 'objekte', k: id, neu: o }]);
      return ok('Geändert.');
    },
    loeschen: ({ ids, sammlung = 'objekte' }) => {
      const k = karte();
      if (!k.s(sammlung)) throw new Error(`Unbekannte Sammlung „${sammlung}“`);
      return ok(`${aendere('Löschen', A.loeschOps(ids.filter((i) => k.s(sammlung).has(i)).map((i) => ({ s: sammlung, k: i }))))} gelöscht.`);
    },
    flaeche_anlegen: async (a) => {
      const k = karte();
      const datei = a.art === 'klang' && a.datei ? await studio.klangFuerZone(a.datei) : null;
      const { ops, id } = A.flaecheOps(k, a.art, a, { name: a.name, tabelle: a.tabelle, punkte: a.punkte, anzahl: a.anzahl, ziel: a.ziel, ankunft: a.ankunft, datei, lautstaerke: a.lautstaerke });
      aendere(`Bereich ${a.art}`, ops);
      return ok(`Bereich angelegt (ID ${id}).`);
    },
    marker_setzen: ({ art, x, y, name, anzahl }) => ok(`${aendere(art === 'ankunft' ? 'Ankunft' : 'Punkt', A.markerOps(karte(), art, x, y, { name, anzahl }))} Änderung(en).`),
    spawnpunkt_setzen: (a) => {
      const menge = a.menge_min ? [a.menge_min, a.menge_max ?? a.menge_min] : undefined;
      const { ops, id } = A.spawnpunktOps(karte(), { x: a.x, y: a.y, inhalt: a.inhalt, chance: a.chance ?? 50, intervall: a.intervall ?? 10, menge, hoehe: a.hoehe });
      aendere('Spawnpunkt', ops);
      return ok(`Spawnpunkt ${id} gesetzt.`);
    },
    gelaende: ({ modus, x, y, radius = 3, staerke = 0.5 }) => ok(`${aendere('Gelände', A.gelaendeOps(karte(), modus, x, y, radius, staerke))} Kacheln geändert.`),
    streuen: ({ x, y, radius, set = 'wald', typen, dichte = 4, radieren = false }) => {
      const liste = typen?.length ? typen : (B.STREU_SETS[set] ?? B.STREU_SETS.wald).typen;
      if (radieren) return ok(`${aendere('Radieren', B.radierOps(karte(), x, y, radius, { typen: liste }))} entfernt.`);
      const { ops, anzahl } = B.streuOps(karte(), x, y, radius, { typen: liste, dichte, saat: Math.floor(Math.random() * 1e9) });
      aendere('Streuen', ops);
      return ok(`${anzahl} Objekte gestreut.`);
    },
    strasse_bauen: ({ x0, y0, x1, y1, fahrbahn = 4, gehweg = 1, laternen = 10 }) => ok(`${aendere('Straße', B.strassenOps(karte(), { x: x0, y: y0 }, { x: x1, y: y1 }, { fahrbahn, gehweg, laternen }).ops)} Änderungen.`),
    ersetzen: (a) => ok(`${aendere('Ersetzen', B.ersetzOps(karte(), { r: a.x !== undefined ? { x: a.x, y: a.y, b: a.b, h: a.h } : null, vonTyp: a.von_typ, zu: a.zu, vonZeichen: a.von_kachel, zuZeichen: a.zu_kachel }))} Änderungen.`),
    generieren: (a) => {
      const r = { x: a.x, y: a.y, b: a.b, h: a.h };
      const e = a.art === 'dorf' ? B.generiereDorf(karte(), r, { haeuser: a.haeuser ?? 6, vorlagen: a.mit_vorlagen ? studio.vorlagen().map((v) => v.vorlage) : [], saat: a.saat ?? 11 }) : B.generiereWald(karte(), r, { dichte: a.dichte ?? 5, set: a.art, saat: a.saat ?? 7 });
      aendere(`${a.art} generiert`, B.verdichte(e.ops));
      return ok(a.art === 'dorf' ? `Dorf mit ${e.haeuser} Häusern generiert.` : 'Wald generiert.');
    },
    notizen_liste: () => ok(null, [...karte().s('notizen')].map(([id, n]) => ({ id, ...n }))),
    notiz_setzen: ({ x, y, text }) => {
      const { ops, id } = A.notizOps(karte(), x, y, text);
      aendere('Notiz', ops);
      return ok(`Notiz ${id} gesetzt.`);
    },
    notiz_erledigt: ({ id, erledigt = true }) => ok(`${aendere('Notiz erledigt', A.aenderOps(karte(), 'notizen', id, { erledigt: erledigt || undefined }))} Änderung.`),
    weltkarte: () => {
      const zonen = studio.zonenKarten();
      const liste = [];
      for (const [id, k] of zonen) {
        liste.push({
          id,
          name: k.name,
          groesse: `${k.breite} × ${k.hoehe}`,
          uebergaenge: [...k.s('uebergaenge').values()].map((u) => {
            const z = zonen.get(u.ziel);
            return { ziel: u.ziel, ankunft: u.ankunft, rand: { x: u.x, y: u.y, b: u.b, h: u.h }, zielGibtEs: !!z, ankunftGibtEs: !!z?.s('ankuenfte').has(u.ankunft), rueckweg: !!z && [...z.s('uebergaenge').values()].some((v) => v.ziel === id) };
          }),
          ankuenfte: Object.fromEntries(k.s('ankuenfte')),
        });
      }
      return ok(null, liste);
    },
    zombie_bereich: (a) => {
      const { ops, id } = A.flaecheOps(karte(), 'zombies', a, { anzahl: a.anzahl, tageszeit: a.tageszeit, varianten: a.varianten, route: a.route });
      if (a.name) ops[0].neu.name = String(a.name).slice(0, 40);
      aendere('Zombie-Bereich', ops);
      return ok(`Zombie-Bereich ${id} angelegt.`);
    },
    laufweg_pruefen: () => {
      karte();
      const r = laufweg(dok.definition());
      return ok(null, { erreichbarProzent: Math.round(r.anteil * 100), eingesperrteKacheln: r.eingesperrt, befunde: r.befunde.slice(0, 40) });
    },
    balance: () => {
      karte();
      return ok(null, balance(dok.definition()));
    },
    vorlagen_liste: () => ok(null, studio.vorlagen().map((v) => ({ id: v.id, name: v.name, b: v.vorlage.b, h: v.vorlage.h }))),
    vorlage_einsetzen: ({ id, x, y }) => W.objekt_platzieren({ id: `vorlage:${id}`, x, y }),
    pruefen: () => {
      const liste = validiere(karte(), { zonen: studio.zonenKarten() });
      return ok(liste.length ? null : 'Keine Probleme gefunden.', liste.length ? liste.slice(0, 60) : undefined);
    },
    rueckgaengig: () => ok(dok.rueckgaengig() ? 'Zurückgenommen.' : 'Nichts zum Zurücknehmen.'),
    speichern: async () => {
      await dok.speichereEntwurf();
      return ok('Entwurf gespeichert.');
    },
    ansicht_bild: async ({ modus, x, y, zoom }) => {
      karte();
      if (modus) studio.setzeAnsicht(modus);
      if (x !== undefined && y !== undefined) studio.ansicht.zeige(x, y, zoom ?? null);
      else if (zoom) studio.ansicht.zeige(studio.ansicht.ziel.x, studio.ansicht.ziel.z, zoom);
      await new Promise((r) => setTimeout(r, 350)); // Modelle nachladen lassen
      return { ok: true, text: `Ansicht ${studio.ansicht.modus}, Mitte ${Math.round(studio.ansicht.ziel.x)}|${Math.round(studio.ansicht.ziel.z)}`, bild: studio.ansicht.bildAlsPng() };
    },
  };

  Object.assign(W, kiModellWerkzeuge(studio), kiAudioWerkzeuge(studio)); // Modell-Werkstatt (Phase 3), Audio-Zentrale (Phase 2)

  return {
    async fuehreAus(name, argumente = {}, quelle = 'mcp') {
      const w = kiWerkzeug(name);
      if (!w || !W[name]) return { ok: false, text: `Unbekanntes Werkzeug „${name}“` };
      for (const p of w.schema.required ?? []) if (argumente[p] === undefined || argumente[p] === null || argumente[p] === '') return { ok: false, text: `Pflichtfeld „${p}“ fehlt` };
      studio.meldeKi?.(quelle, name);
      try {
        const e = await W[name](argumente);
        return e;
      } catch (f) {
        return { ok: false, text: `Fehler: ${f.message}` };
      }
    },
  };
}
