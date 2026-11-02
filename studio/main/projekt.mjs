/**
 * Browser Survival Studio – Projekt-Dateien (Hauptprozess, reines Node, ohne Electron → testbar: tests/studio.test.js).
 *
 * Ein „Projekt“ = der Spielordner (Standard: dieses Repo). Gelesen/geschrieben wird nur dort:
 *   Zonen        server/spiel/karten/<id>.js (Kartendateien; registriert = in KARTEN von kartenLader.js)
 *   Entwürfe     .studio/entwuerfe/<id>.json   (Arbeitsstand + Verlauf, gitignored)
 *   Vorlagen     studio/vorlagen/<id>.json     (Prefabs, im Repo → für alle Mitbauenden)
 *   Modelle      client/assets/eigene/<stem>.glb + index.json + credits.json (Import mit Credits)
 *   Werkstatt    speichereModell (alte .glb → .studio/modelle/<stem>-<zeit>.glb), einstellenModell (index.json-Felder,
 *                Regeln studio/kern/modelle.js), modellSicherungen / stelleModellWiederHer
 *   Papierkorb   .studio/papierkorb/<id>/ (Modelle, Audio) – leert sich nach PAPIERKORB_TAGE (20) beim Studio-Start
 *   Audio (2.x)  schreibeAudio/loescheAudio (nur client/audio/eigene/, client/audio/karten/<zone>/, client/musik/<ordner>/;
 *                Löschen = in .studio/audio-papierkorb/), speichereAudioEinstellungen (einstellungen.json Sounds/Musik) →
 *                Indexe neu (werkzeuge/audio/indexBauen.mjs: eigene.json, musik.json)
 * Export ins Spiel = derselbe Weg wie `npm run karte:editor` (Prüfung → verarbeiteKarte → alsJsModul → registriere).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { pruefeModellFelder, aktualisiereIndex } from '../kern/modelle.js';

export const PAPIERKORB_TAGE = 20;
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

  // ---------- Versionen (benannte Schnappschüsse je Zone, .studio/versionen/<id>.json) ----------
  versionen(id) {
    const datei = this.pfad('.studio/versionen', `${id}.json`);
    if (!ID_MUSTER.test(id) || !existsSync(datei)) return [];
    return JSON.parse(readFileSync(datei, 'utf8'));
  }

  speichereVersionen(id, liste) {
    if (!ID_MUSTER.test(id)) throw new Error('Ungültige Zonen-ID');
    mkdirSync(this.pfad('.studio/versionen'), { recursive: true });
    writeFileSync(this.pfad('.studio/versionen', `${id}.json`), JSON.stringify(liste));
    return true;
  }

  /**
   * editor/KI_KARTEN_ANLEITUNG.md neu schreiben (Regel: nach neuen Items/Modellen `npm run ki:anleitung`). Eigener Prozess,
   * damit frisch geänderte Daten (studioDaten.js, index.json) gelesen werden – im Studio ist das Modul sonst zwischengespeichert.
   */
  aktualisiereKiAnleitung() {
    const skript = this.pfad('werkzeuge/ki/kiAnleitung.mjs');
    if (!existsSync(skript)) return Promise.resolve(false);
    return new Promise((ok) => execFile(process.execPath, [skript], { cwd: this.wurzel, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60_000 }, (fehler) => ok(!fehler)));
  }

  // ---------- Item-Editor (server/spiel/konfiguration/studioDaten.js) ----------
  async studioDaten() {
    const datei = this.pfad('server/spiel/konfiguration/studioDaten.js');
    if (!existsSync(datei)) return { gegenstaende: {}, icons: {}, lootTabellen: {}, rezepte: {} };
    const modul = await import(`${pathToFileURL(datei).href}?t=${statSync(datei).mtimeMs}`);
    return JSON.parse(JSON.stringify(modul.STUDIO_DATEN));
  }

  speichereStudioDaten(daten) {
    const sauber = {};
    for (const teil of ['gegenstaende', 'icons', 'lootTabellen', 'rezepte']) {
      const w = daten?.[teil] ?? {};
      if (typeof w !== 'object' || Array.isArray(w)) throw new Error(`studioDaten.${teil} muss ein Objekt sein`);
      for (const id of Object.keys(w)) if (!ID_MUSTER.test(id)) throw new Error(`Ungültige ID „${id}“ (a–z, 0–9, _)`);
      sauber[teil] = w;
    }
    for (const [name, t] of Object.entries(sauber.lootTabellen)) if (!Array.isArray(t) || t.some((e) => typeof e?.id !== 'string' || !(Number(e.gewicht) > 0))) throw new Error(`Loot-Tabelle „${name}“: Einträge { id, gewicht > 0 }`);
    const kopf = readFileSync(this.pfad('server/spiel/konfiguration/studioDaten.js'), 'utf8').split('export const')[0];
    writeFileSync(this.pfad('server/spiel/konfiguration/studioDaten.js'), `${kopf}export const STUDIO_DATEN = Object.freeze(${JSON.stringify(sauber, null, 2)});\n`);
    return true;
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

  // ---------- Modell-Werkstatt (Phase 3) ----------
  #schreibeIndex(index) {
    writeFileSync(this.pfad('client/assets/eigene/index.json'), JSON.stringify(index));
  }

  /** Spiel-/Katalog-Felder eines Modells ändern (ohne die .glb anzufassen). @returns neuer Eintrag */
  einstellenModell(datei, felder) {
    const patch = pruefeModellFelder(felder);
    const index = aktualisiereIndex(this.modellIndex(), datei, patch);
    this.#schreibeIndex(index);
    const e = index.find((x) => x.datei === datei);
    if (patch.urheber || patch.lizenz || patch.url) this.fuegeCreditHinzu({ paket: `${e.name} (${datei})`, urheber: e.urheber || 'unbekannt', lizenz: e.lizenz || 'keine Angabe', url: e.url || '' });
    return e;
  }

  /**
   * Bearbeitetes Modell speichern. Gibt es die Datei schon (und nicht `neu`), wandert die alte Fassung nach
   * .studio/modelle/<stem>-<zeit>.glb (gitignored, wiederherstellbar). Index: Maße/Größe neu + `felder`.
   * @param { stem, bytes (glb), vorschau (png bytes)?, felder {name, kategorie, masse, zielHoehe, …}, neu }
   */
  speichereModell({ stem, bytes, vorschau, felder = {}, neu = false }) {
    stem = String(stem ?? '').toLowerCase();
    if (!STEM_MUSTER.test(stem)) throw new Error('Dateiname nur a–z, 0–9, - und _');
    if (Buffer.from(bytes).subarray(0, 4).toString('latin1') !== 'glTF') throw new Error('Keine gültige .glb-Datei');
    const datei = `${stem}.glb`;
    const ziel = this.#sicher(`client/assets/eigene/${datei}`);
    const gab = existsSync(ziel);
    if (gab && neu) throw new Error(`„${datei}“ gibt es schon – anderen Namen wählen`);
    let sicherung = null;
    if (gab) {
      mkdirSync(this.pfad('.studio/modelle'), { recursive: true });
      const zeit = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
      sicherung = `.studio/modelle/${stem}-${zeit}.glb`;
      for (let n = 2; existsSync(this.pfad(sicherung)); n++) sicherung = `.studio/modelle/${stem}-${zeit}-${n}.glb`;
      copyFileSync(ziel, this.pfad(sicherung));
    }
    writeFileSync(ziel, Buffer.from(bytes));
    let index = this.modellIndex();
    if (!index.some((e) => e.datei === datei)) {
      index.push({ datei, name: felder.name || stem, kategorie: felder.kategorie || 'deko' });
      index.sort((a, b) => a.datei.localeCompare(b.datei, 'de'));
    }
    index = aktualisiereIndex(index, datei, pruefeModellFelder({ ...felder, groesse: statSync(ziel).size }));
    this.#schreibeIndex(index);
    if (vorschau) {
      mkdirSync(this.pfad('client/assets/eigene/vorschau'), { recursive: true });
      writeFileSync(this.#sicher(`client/assets/eigene/vorschau/${stem}.png`), Buffer.from(vorschau));
    }
    const e = index.find((x) => x.datei === datei);
    if (e.urheber || e.lizenz || e.url) this.fuegeCreditHinzu({ paket: `${e.name} (${datei})`, urheber: e.urheber || 'unbekannt', lizenz: e.lizenz || 'keine Angabe', url: e.url || '' });
    return { eintrag: e, sicherung };
  }

  /** Gesicherte Fassungen eines Modells (neueste zuerst): [{ datei, zeit, groesse }] */
  modellSicherungen(stem) {
    const ordner = this.pfad('.studio/modelle');
    if (!STEM_MUSTER.test(stem) || !existsSync(ordner)) return [];
    const muster = new RegExp(`^${stem.replace(/[-]/g, '\\-')}-(\\d{4}-\\d\\d-\\d\\dT[\\d-]+)\\.glb$`);
    return readdirSync(ordner)
      .map((d) => ({ d, m: muster.exec(d) }))
      .filter((x) => x.m)
      .map(({ d, m }) => ({ datei: `.studio/modelle/${d}`, zeit: m[1], groesse: statSync(path.join(ordner, d)).size }))
      .sort((a, b) => b.zeit.localeCompare(a.zeit));
  }

  /** Sicherung zurückholen (die aktuelle Fassung wird dabei selbst gesichert) */
  stelleModellWiederHer(stem, sicherung) {
    if (!this.modellSicherungen(stem).some((x) => x.datei === sicherung)) throw new Error('Sicherung nicht gefunden');
    const bytes = readFileSync(this.#sicher(sicherung));
    return this.speichereModell({ stem, bytes, felder: {} });
  }

  // ---------- Texturen aus der Asset-Suche (Phase 4.11): client/assets/eigene/texturen/<name>.jpg|png + Credits ----------
  speichereTextur({ name, bytes, endung = 'jpg', credits = null }) {
    const stem = String(name ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'textur';
    if (!['jpg', 'png', 'webp'].includes(endung)) throw new Error('Textur: jpg, png oder webp');
    mkdirSync(this.pfad('client/assets/eigene/texturen'), { recursive: true });
    let datei = `${stem}.${endung}`;
    for (let n = 2; existsSync(this.pfad('client/assets/eigene/texturen', datei)); n++) datei = `${stem}-${n}.${endung}`;
    writeFileSync(this.pfad('client/assets/eigene/texturen', datei), Buffer.from(bytes));
    if (credits) this.fuegeCreditHinzu({ paket: `Textur ${credits.titel ?? stem} (texturen/${datei})`, urheber: credits.urheber || 'unbekannt', lizenz: credits.lizenz || 'keine Angabe', url: credits.url || '' });
    return `assets/eigene/texturen/${datei}`;
  }

  texturen() {
    const o = this.pfad('client/assets/eigene/texturen');
    return existsSync(o) ? readdirSync(o).filter((d) => /\.(jpe?g|png|webp)$/i.test(d)).sort().map((d) => `assets/eigene/texturen/${d}`) : [];
  }

  // ---------- Papierkorb (Phase 4.5): .studio/papierkorb/<id>/{dateien…, eintrag.json}, leert sich nach PAPIERKORB_TAGE ----------
  /** Dateien (relativ zum Spielordner) in den Papierkorb verschieben. meta = { art, name, index? } → id */
  #inPapierkorb(relPfade, meta) {
    const id = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23)}_${meta.art}_${String(meta.name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40)}`;
    const ordner = this.pfad('.studio/papierkorb', id);
    mkdirSync(ordner, { recursive: true });
    const dateien = [];
    for (const rel of relPfade) {
      const quelle = this.#sicher(rel);
      if (!existsSync(quelle)) continue;
      const ziel = path.join(ordner, 'dateien', rel);
      mkdirSync(path.dirname(ziel), { recursive: true });
      copyFileSync(quelle, ziel);
      rmSync(quelle);
      dateien.push(rel);
    }
    writeFileSync(path.join(ordner, 'eintrag.json'), JSON.stringify({ ...meta, zeit: Date.now(), dateien }, null, 1));
    return id;
  }

  /** [{ id, art, name, zeit, dateien, tageUebrig }] neueste zuerst */
  papierkorb() {
    const basis = this.pfad('.studio/papierkorb');
    if (!existsSync(basis)) return [];
    return readdirSync(basis)
      .map((id) => {
        try {
          const e = JSON.parse(readFileSync(path.join(basis, id, 'eintrag.json'), 'utf8'));
          return { id, art: e.art, name: e.name, zeit: e.zeit, dateien: e.dateien, tageUebrig: Math.max(0, Math.ceil(PAPIERKORB_TAGE - (Date.now() - e.zeit) / 86_400_000)) };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.zeit - a.zeit);
  }

  /** Eintrag zurückholen (Dateien an ihren alten Ort; Modelle auch zurück in index.json). Belegte Ziele → Fehler */
  async papierkorbWiederherstellen(id) {
    const ordner = this.#korbOrdner(id);
    const e = JSON.parse(readFileSync(path.join(ordner, 'eintrag.json'), 'utf8'));
    for (const rel of e.dateien) if (existsSync(this.#sicher(rel))) throw new Error(`${rel} gibt es schon – erst umbenennen oder löschen`);
    for (const rel of e.dateien) {
      mkdirSync(path.dirname(this.#sicher(rel)), { recursive: true });
      copyFileSync(path.join(ordner, 'dateien', rel), this.#sicher(rel));
    }
    if (e.art === 'modell' && e.index) {
      const index = this.modellIndex().filter((x) => x.datei !== e.index.datei);
      index.push(e.index);
      index.sort((a, b) => a.datei.localeCompare(b.datei, 'de'));
      this.#schreibeIndex(index);
    }
    if (e.art === 'audio') await this.#audioIndexe();
    rmSync(ordner, { recursive: true, force: true });
    return e;
  }

  papierkorbLoeschen(id) {
    rmSync(this.#korbOrdner(id), { recursive: true, force: true });
    return true;
  }

  /** Alles älter als `tage` endgültig löschen (Studio-Start). @returns Anzahl */
  papierkorbAufraeumen(tage = PAPIERKORB_TAGE, jetzt = Date.now()) {
    let n = 0;
    for (const e of this.papierkorb()) {
      if (jetzt - e.zeit > tage * 86_400_000) {
        this.papierkorbLoeschen(e.id);
        n++;
      }
    }
    // alte Ablagen aus Phase 2/3 mit aufräumen (Audio-Papierkorb, Modell-Sicherungen)
    for (const alt of ['.studio/audio-papierkorb', '.studio/modelle']) {
      const o = this.pfad(alt);
      if (!existsSync(o)) continue;
      for (const d of readdirSync(o)) if (jetzt - statSync(path.join(o, d)).mtimeMs > tage * 86_400_000) rmSync(path.join(o, d), { force: true });
    }
    return n;
  }

  #korbOrdner(id) {
    if (!/^[\w.-]{1,120}$/.test(id)) throw new Error('Ungültiger Papierkorb-Eintrag');
    const o = this.pfad('.studio/papierkorb', id);
    if (!existsSync(path.join(o, 'eintrag.json'))) throw new Error('Eintrag nicht im Papierkorb');
    return o;
  }

  /** Modell löschen: .glb + Vorschaubild in den Papierkorb, Eintrag aus index.json (wird mit abgelegt) */
  loescheModell(stem) {
    stem = String(stem ?? '').toLowerCase();
    if (!STEM_MUSTER.test(stem)) throw new Error('Ungültiger Dateiname');
    const datei = `${stem}.glb`;
    const eintrag = this.modellIndex().find((x) => x.datei === datei);
    if (!eintrag && !existsSync(this.pfad('client/assets/eigene', datei))) throw new Error(`${datei} gibt es nicht`);
    const id = this.#inPapierkorb([`client/assets/eigene/${datei}`, `client/assets/eigene/vorschau/${stem}.png`], { art: 'modell', name: eintrag?.name ?? stem, index: eintrag ?? null });
    this.#schreibeIndex(this.modellIndex().filter((x) => x.datei !== datei));
    return { papierkorb: id };
  }

  // ---------- Vorschaubilder der Bausteine (Phase 4.4, .studio/vorschau/<schlüssel>.png) ----------
  vorschauLesen(schluessel) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(schluessel)) return null;
    const d = this.pfad('.studio/vorschau', `${schluessel}.png`);
    return existsSync(d) ? readFileSync(d).toString('base64') : null;
  }

  vorschauSchreiben(schluessel, png) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(schluessel)) throw new Error('Ungültiger Schlüssel');
    mkdirSync(this.pfad('.studio/vorschau'), { recursive: true });
    writeFileSync(this.pfad('.studio/vorschau', `${schluessel}.png`), Buffer.from(png, 'base64'));
    return true;
  }

  vorschauLeeren() {
    rmSync(this.pfad('.studio/vorschau'), { recursive: true, force: true });
    return true;
  }

  // ---------- Audio-Zentrale (Phase 2) ----------
  /** Pfad (relativ zum Spielordner) in einem freigegebenen Audio-Ordner? → absoluter Pfad, sonst Fehler */
  #audioPfad(pfad) {
    const p = String(pfad ?? '').replace(/\\/g, '/');
    const ok = /^client\/audio\/eigene\/[^/]+$/.test(p) || /^client\/audio\/karten\/[a-z0-9_]{1,40}\/[^/]+$/.test(p) || /^client\/musik\/[a-z0-9_-]{1,40}\/[^/]+$/i.test(p);
    if (!ok || !/\.(ogg|mp3|wav|m4a|flac|opus|webm)$/i.test(p) || /[<>:"|?*]/.test(p.split('/').at(-1))) throw new Error(`Audio-Pfad nicht erlaubt: ${p} (client/audio/eigene/, client/audio/karten/<zone>/, client/musik/<ordner>/)`);
    return this.#sicher(p);
  }

  async #audioIndexe() {
    const { schreibeSoundIndex, schreibeMusikIndex } = await import(`${pathToFileURL(this.pfad('werkzeuge/audio/indexBauen.mjs')).href}?t=${Date.now()}`);
    mkdirSync(this.pfad('client/musik'), { recursive: true });
    mkdirSync(this.pfad('client/audio/eigene'), { recursive: true });
    const sound = schreibeSoundIndex(this.wurzel);
    const musik = schreibeMusikIndex(this.wurzel);
    return [...sound.warnungen, ...musik.warnungen];
  }

  /** Audiodatei schreiben (+ optional Credits) → Indexe neu. @returns { pfad, groesse, warnungen } */
  async schreibeAudio({ pfad, bytes, credits = null, ueberschreiben = true }) {
    const ziel = this.#audioPfad(pfad);
    if (existsSync(ziel) && !ueberschreiben) throw new Error(`${pfad} gibt es schon`);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, Buffer.from(bytes));
    if (credits?.urheber || credits?.lizenz || credits?.url) this.fuegeCreditHinzu({ paket: `Klang ${path.basename(ziel)}`, urheber: credits.urheber || 'unbekannt', lizenz: credits.lizenz || 'keine Angabe', url: credits.url || '' });
    return { pfad, groesse: statSync(ziel).size, warnungen: await this.#audioIndexe() };
  }

  /** Audiodatei in einem freigegebenen Ordner kopieren (Zuordnen zu Ereignis/Musik-Ordner) */
  async kopiereAudio({ von, nach }) {
    const quelle = this.#sicher(String(von).replace(/^\/+/, ''));
    if (!/^client\/(audio|musik)\//.test(String(von)) || !existsSync(quelle)) throw new Error(`Quelle fehlt: ${von}`);
    return this.schreibeAudio({ pfad: nach, bytes: readFileSync(quelle) });
  }

  /** Löschen = verschieben nach .studio/audio-papierkorb/ (zurückholbar) → Indexe neu */
  async loescheAudio({ pfad }) {
    const ziel = this.#audioPfad(pfad);
    if (!existsSync(ziel)) throw new Error(`${pfad} gibt es nicht`);
    const id = this.#inPapierkorb([String(pfad)], { art: 'audio', name: path.basename(ziel) });
    return { papierkorb: `.studio/papierkorb/${id}`, warnungen: await this.#audioIndexe() };
  }

  /** einstellungen.json schreiben: sound → client/audio/eigene/, musik → client/musik/ (bereinigt) → Indexe neu */
  async speichereAudioEinstellungen({ sound, musik }) {
    const { pruefeSoundEinstellungen } = await import(pathToFileURL(this.pfad('client/audio/eigeneSounds.js')).href);
    const { pruefeMusikEinstellungen } = await import(pathToFileURL(this.pfad('client/audio/musikIndex.js')).href);
    if (sound) writeFileSync(this.pfad('client/audio/eigene/einstellungen.json'), `${JSON.stringify(pruefeSoundEinstellungen(sound), null, 2)}\n`);
    if (musik) {
      mkdirSync(this.pfad('client/musik'), { recursive: true });
      writeFileSync(this.pfad('client/musik/einstellungen.json'), `${JSON.stringify(pruefeMusikEinstellungen(musik), null, 2)}\n`);
    }
    return { warnungen: await this.#audioIndexe() };
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
