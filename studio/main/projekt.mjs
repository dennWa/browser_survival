/**
 * Browser Survival Studio – Projekt-Dateien (Hauptprozess, reines Node, ohne Electron → testbar: tests/studio.test.js).
 *
 * Ein „Projekt“ = der Spielordner (Standard: dieses Repo). Gelesen/geschrieben wird nur dort:
 *   Zonen        server/spiel/karten/<id>.js (Kartendateien; registriert = in KARTEN von kartenLader.js)
 *   Entwürfe     .studio/entwuerfe/<id>.json   (Arbeitsstand + Verlauf, gitignored)
 *   Vorlagen     studio/vorlagen/<id>.json     (Prefabs, im Repo → für alle Mitbauenden)
 *   Modelle      client/assets/eigene/<stem>.glb + index.json + credits.json (Import mit Credits)
 *   Sounds       client/audio/eigene/ (Phase 2)
 * Export ins Spiel = derselbe Weg wie `npm run karte:editor` (Prüfung → verarbeiteKarte → alsJsModul → registriere).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const KEINE_KARTEN = new Set(['kartenLader.js', 'lootZonen.js', 'zonenEinstellungen.js', 'spawnpunkte.js']);
export const ID_MUSTER = /^[a-z0-9_]{1,40}$/;
const STEM_MUSTER = /^[a-z0-9][a-z0-9_-]{0,60}$/;

export class Projekt {
  /** @param wurzel  Spielordner (enthält server/spiel/karten/kartenLader.js) */
  constructor(wurzel) {
    this.wurzel = path.resolve(wurzel);
    if (!existsSync(this.pfad('server/spiel/karten/kartenLader.js'))) throw new Error(`Kein Browser-Survival-Spielordner: ${this.wurzel}`);
  }

  pfad(...teile) {
    return path.join(this.wurzel, ...teile);
  }

  /** Pfad innerhalb des Projekts erzwingen (keine ../-Ausbrüche) */
  #sicher(relativ) {
    const voll = path.resolve(this.wurzel, relativ);
    if (voll !== this.wurzel && !voll.startsWith(this.wurzel + path.sep)) throw new Error(`Pfad außerhalb des Spielordners: ${relativ}`);
    return voll;
  }

  info() {
    let version = '?';
    try {
      version = JSON.parse(readFileSync(this.pfad('package.json'), 'utf8')).version;
    } catch {
      // egal
    }
    return { wurzel: this.wurzel, name: path.basename(this.wurzel), version };
  }

  /** IDs, die in KARTEN eingetragen sind (= im Spiel spielbar) */
  registrierte() {
    const text = readFileSync(this.pfad('server/spiel/karten/kartenLader.js'), 'utf8');
    const block = text.match(/export const KARTEN = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
    return [...block.matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1]);
  }

  /** Alle Zonen: Kartendateien + Entwürfe. @returns [{ id, name, breite, hoehe, registriert, entwurf, datei }] */
  async zonen() {
    const registriert = new Set(this.registrierte());
    const liste = new Map();
    for (const datei of readdirSync(this.pfad('server/spiel/karten'))) {
      if (!datei.endsWith('.js') || KEINE_KARTEN.has(datei)) continue;
      try {
        const def = await this.#importiere(datei);
        if (!def) continue;
        liste.set(def.id, { id: def.id, name: def.name ?? def.id, breite: def.kacheln[0].length, hoehe: def.kacheln.length, registriert: registriert.has(def.id), entwurf: false, datei: `server/spiel/karten/${datei}` });
      } catch {
        // kaputte Datei → nicht auflisten
      }
    }
    for (const e of this.entwuerfe()) {
      const z = liste.get(e.id);
      if (z) z.entwurf = true;
      else liste.set(e.id, { id: e.id, name: e.name, breite: e.breite, hoehe: e.hoehe, registriert: false, entwurf: true, datei: null });
    }
    return [...liste.values()].sort((a, b) => Number(b.registriert) - Number(a.registriert) || a.name.localeCompare(b.name, 'de'));
  }

  /** Kartendatei frisch importieren (Query gegen den Modul-Cache – Kartendateien importieren nichts) */
  async #importiere(datei) {
    const url = `${pathToFileURL(this.pfad('server/spiel/karten', datei)).href}?t=${statSync(this.pfad('server/spiel/karten', datei)).mtimeMs}`;
    const modul = await import(url);
    return Object.values(modul).find((w) => w && typeof w === 'object' && Array.isArray(w.kacheln) && typeof w.id === 'string') ?? null;
  }

  /** Spiel-Definition einer Zone (aus der Kartendatei) oder null */
  async definition(id) {
    if (!ID_MUSTER.test(id)) throw new Error(`Ungültige Zonen-ID „${id}“`);
    for (const datei of readdirSync(this.pfad('server/spiel/karten'))) {
      if (!datei.endsWith('.js') || KEINE_KARTEN.has(datei)) continue;
      const def = await this.#importiere(datei).catch(() => null);
      if (def?.id === id) return def;
    }
    return null;
  }

  // ---------- Entwürfe ----------
  entwuerfe() {
    const ordner = this.pfad('.studio/entwuerfe');
    if (!existsSync(ordner)) return [];
    return readdirSync(ordner)
      .filter((d) => d.endsWith('.json'))
      .map((d) => {
        try {
          const j = JSON.parse(readFileSync(path.join(ordner, d), 'utf8'));
          return { id: j.karte?.werte?.id ?? d.slice(0, -5), name: j.karte?.werte?.name ?? d, breite: j.karte?.breite, hoehe: j.karte?.hoehe };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  ladeEntwurf(id) {
    const datei = this.pfad('.studio/entwuerfe', `${id}.json`);
    if (!ID_MUSTER.test(id) || !existsSync(datei)) return null;
    return JSON.parse(readFileSync(datei, 'utf8'));
  }

  speichereEntwurf(id, inhalt) {
    if (!ID_MUSTER.test(id)) throw new Error(`Ungültige Zonen-ID „${id}“`);
    mkdirSync(this.pfad('.studio/entwuerfe'), { recursive: true });
    writeFileSync(this.pfad('.studio/entwuerfe', `${id}.json`), JSON.stringify(inhalt));
    return true;
  }

  loescheEntwurf(id) {
    const datei = this.pfad('.studio/entwuerfe', `${id}.json`);
    if (ID_MUSTER.test(id) && existsSync(datei)) rmSync(datei);
    return true;
  }

  /**
   * Zone ins Spiel übernehmen: Kartendatei schreiben + in KARTEN eintragen (wie `npm run karte:editor`).
   * @returns { datei, registriert, hinweise[] }
   */
  async insSpiel(definition) {
    if (!ID_MUSTER.test(definition?.id ?? '')) throw new Error('Zonen-ID nur a–z, 0–9, _ (max. 40 Zeichen)');
    if (KEINE_KARTEN.has(`${definition.id}.js`)) throw new Error(`„${definition.id}“ ist als Zonen-ID reserviert`);
    const { verarbeiteKarte } = await import(pathToFileURL(this.pfad('server/spiel/karten/kartenLader.js')).href);
    const { alsJsModul } = await import(pathToFileURL(this.pfad('editor/kern/veroeffentlichen.js')).href);
    const { registriere } = await import(pathToFileURL(this.pfad('werkzeuge/karten/registrieren.mjs')).href);
    verarbeiteKarte(definition); // wirft bei allem, was das Spiel nicht laden könnte
    const relativ = `server/spiel/karten/${definition.id}.js`;
    writeFileSync(this.pfad(relativ), alsJsModul(definition, { quelle: 'Browser Survival Studio (studio/)' }));
    const hinweise = [];
    const neu = registriere(this.pfad('server/spiel/karten/kartenLader.js'), definition.id, (t) => hinweise.push(t.trim()));
    return { datei: relativ, registriert: neu, hinweise };
  }

  // ---------- Vorlagen (Prefabs) ----------
  vorlagen() {
    const ordner = this.pfad('studio/vorlagen');
    if (!existsSync(ordner)) return [];
    return readdirSync(ordner)
      .filter((d) => d.endsWith('.json'))
      .map((d) => {
        try {
          return JSON.parse(readFileSync(path.join(ordner, d), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  speichereVorlage(vorlage) {
    if (!ID_MUSTER.test(vorlage?.id ?? '')) throw new Error('Vorlagen-ID nur a–z, 0–9, _');
    mkdirSync(this.pfad('studio/vorlagen'), { recursive: true });
    writeFileSync(this.pfad('studio/vorlagen', `${vorlage.id}.json`), `${JSON.stringify(vorlage, null, 1)}\n`);
    return true;
  }

  loescheVorlage(id) {
    const datei = this.pfad('studio/vorlagen', `${id}.json`);
    if (ID_MUSTER.test(id) && existsSync(datei)) rmSync(datei);
    return true;
  }

  // ---------- Modelle (Import mit Credits) ----------
  modellIndex() {
    const datei = this.pfad('client/assets/eigene/index.json');
    return existsSync(datei) ? JSON.parse(readFileSync(datei, 'utf8')) : [];
  }

  credits() {
    const datei = this.pfad('client/assets/eigene/credits.json');
    return existsSync(datei) ? JSON.parse(readFileSync(datei, 'utf8')) : [];
  }

  /**
   * Modell importieren: Datei nach client/assets/eigene/<stem>.glb, Eintrag in index.json (mit Maßen) und credits.json.
   * @param quelle  absoluter Pfad der .glb ODER { bytes: Uint8Array }
   * @param meta    { stem, name, kategorie, masse: {b,h,hoehe}, zielHoehe, urheber, lizenz, url }
   */
  importiereModell(quelle, meta) {
    const stem = String(meta.stem ?? '').toLowerCase();
    if (!STEM_MUSTER.test(stem)) throw new Error('Dateiname nur a–z, 0–9, - und _');
    const ziel = this.#sicher(`client/assets/eigene/${stem}.glb`);
    if (existsSync(ziel) && !meta.ueberschreiben) throw new Error(`„${stem}.glb“ gibt es schon – anderen Namen wählen`);
    if (typeof quelle === 'string') copyFileSync(quelle, ziel);
    else writeFileSync(ziel, Buffer.from(quelle.bytes));
    const kopf = readFileSync(ziel).subarray(0, 4).toString('latin1');
    if (kopf !== 'glTF') {
      rmSync(ziel);
      throw new Error('Keine gültige .glb-Datei (binäres glTF)');
    }
    const index = this.modellIndex().filter((e) => e.datei !== `${stem}.glb`);
    const eintrag = { datei: `${stem}.glb`, name: meta.name || stem, groesse: statSync(ziel).size, kategorie: meta.kategorie || 'deko' };
    if (meta.masse) eintrag.masse = meta.masse;
    if (meta.zielHoehe > 0) eintrag.zielHoehe = meta.zielHoehe;
    index.push(eintrag);
    index.sort((a, b) => a.datei.localeCompare(b.datei, 'de'));
    writeFileSync(this.pfad('client/assets/eigene/index.json'), JSON.stringify(index));
    if (meta.vorschau) {
      mkdirSync(this.pfad('client/assets/eigene/vorschau'), { recursive: true });
      writeFileSync(this.#sicher(`client/assets/eigene/vorschau/${stem}.png`), Buffer.from(meta.vorschau));
    }
    if (meta.urheber || meta.lizenz || meta.url) this.fuegeCreditHinzu({ paket: `${eintrag.name} (${stem}.glb)`, urheber: meta.urheber || 'unbekannt', lizenz: meta.lizenz || 'keine Angabe', url: meta.url || '' });
    return eintrag;
  }

  // ---------- Klänge (Karten-Klänge liegen unter client/audio/karten/<zone>/) ----------
  /** Alle Audiodateien, die als Kartenklang taugen: [{ pfad (relativ zu client/), groesse }] */
  klangDateien() {
    const liste = [];
    const lauf = (rel) => {
      const voll = this.pfad('client', rel);
      if (!existsSync(voll)) return;
      for (const d of readdirSync(voll, { withFileTypes: true })) {
        if (d.isDirectory()) lauf(`${rel}/${d.name}`);
        else if (/\.(ogg|mp3|wav|m4a|flac|opus|webm)$/i.test(d.name)) liste.push({ pfad: `${rel}/${d.name}`, groesse: statSync(path.join(voll, d.name)).size });
      }
    };
    for (const o of ['audio/karten', 'audio/eigene', 'musik']) lauf(o);
    return liste.sort((a, b) => a.pfad.localeCompare(b.pfad, 'de'));
  }

  /** Klang für eine Zone bereitstellen: liegt er nicht schon in audio/karten/<zone>/, wird er dorthin kopiert. @returns datei */
  klangFuerZone(quelle, zone) {
    if (!ID_MUSTER.test(zone)) throw new Error('Ungültige Zonen-ID');
    if (quelle.startsWith(`audio/karten/${zone}/`)) return quelle;
    const name = path.basename(quelle).toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(-80);
    const ziel = `audio/karten/${zone}/${name}`;
    mkdirSync(this.pfad('client/audio/karten', zone), { recursive: true });
    copyFileSync(this.#sicher(`client/${quelle}`), this.#sicher(`client/${ziel}`));
    return ziel;
  }

  /** Neue Audiodatei für eine Zone (Import mit Credits) */
  importiereKlang(bytes, { zone, name, urheber, lizenz, url }) {
    if (!ID_MUSTER.test(zone)) throw new Error('Ungültige Zonen-ID');
    const datei = String(name).toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(-80);
    if (!/\.(ogg|mp3|wav|m4a|flac|opus|webm)$/.test(datei)) throw new Error('Audioformat: ogg, mp3, wav, m4a, flac, opus, webm');
    mkdirSync(this.pfad('client/audio/karten', zone), { recursive: true });
    const ziel = `audio/karten/${zone}/${datei}`;
    writeFileSync(this.#sicher(`client/${ziel}`), Buffer.from(bytes));
    if (urheber || lizenz || url) this.fuegeCreditHinzu({ paket: `Klang ${datei} (${zone})`, urheber: urheber || 'unbekannt', lizenz: lizenz || 'keine Angabe', url: url || '' });
    return ziel;
  }

  fuegeCreditHinzu(c) {
    const liste = this.credits().filter((x) => x.paket !== c.paket);
    liste.push({ paket: c.paket, urheber: c.urheber, lizenz: c.lizenz, url: c.url });
    writeFileSync(this.pfad('client/assets/eigene/credits.json'), `${JSON.stringify(liste, null, 2)}\n`);
  }
}
