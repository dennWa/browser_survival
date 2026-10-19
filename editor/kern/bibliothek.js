/**
 * Projekt-Bibliothek für 3D-Modelle (Editor 2.0, Phase 3) – umgebungsfrei, getestet in tests/editorBibliothek.test.js.
 *
 * Modelle liegen einmal im Projekt (Browser: IndexedDB-Bereich `assets`, ui/bibliothek.js), Karten-Typen verweisen nur per
 * `asset: '<id>'`. Die ID kommt aus dem Inhalt (gleiche Datei = gleiche ID → keine Doppelten). Für Spiel, Test, Export
 * und Veröffentlichen bettet `format.nachDefinition` das Modell wieder als `glb` (Data-URL) ein → `mitModell(typ)`.
 *
 * Eintrag (Meta): { id, name, art: 'modell', kategorie, ordner, tags[], lizenz, urheber, quelle, masse {b,h,hoehe},
 *                   dreiecke, animationen[], vorschau (data:image/…), groesse (Bytes), erstellt }
 */
export const GLB_KOPF = 'data:model/gltf-binary;base64,';
export const MODELL_MAX_MB = 8;
export const WARN_MB = 3;
export const WARN_DREIECKE = 60000;
const VORSCHAU_MAX = 120000; // Zeichen der Vorschau-Data-URL
const NICHT_UNTERSTUETZT = { KHR_draco_mesh_compression: 'Draco-Kompression', EXT_meshopt_compression: 'Meshopt-Kompression', KHR_texture_basisu: 'Basis-Texturen (KTX2)' };

// ---------------------------------------------------------------- Bytes / Base64

export function base64ZuBytes(text) {
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

export function bytesZuBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function dataUrlZuBytes(url) {
  const komma = String(url).indexOf(',');
  return base64ZuBytes(String(url).slice(komma + 1));
}

export const bytesZuGlbUrl = (bytes) => GLB_KOPF + bytesZuBase64(bytes);

/** Inhalts-ID: FNV-1a (32 bit) + Länge → 'm_1a2b3c4d_5kq' (Modelle) bzw. 'a_…' (Audio, Phase 4) */
export function assetId(bytes, praefix = 'm') {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${praefix}_${h.toString(16).padStart(8, '0')}_${bytes.length.toString(36)}`;
}

export const ASSET_ID_MUSTER = /^m_[0-9a-f]{8}_[0-9a-z]{1,8}$/;
export const AUDIO_ID_MUSTER = /^a_[0-9a-f]{8}_[0-9a-z]{1,8}$/;

// ---------------------------------------------------------------- GLB lesen / bauen

export function istGlb(bytes) {
  if (!bytes || bytes.length < 20) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return v.getUint32(0, true) === 0x46546c67 && v.getUint32(4, true) === 2;
}

/** JSON-Teil einer .glb */
export function glbJson(bytes) {
  if (!istGlb(bytes)) throw new Error('Keine .glb-Datei (binäres glTF 2.0)');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const laenge = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || 20 + laenge > bytes.length) throw new Error('.glb beschädigt (JSON-Teil fehlt)');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + laenge)));
}

/**
 * Kennzahlen einer .glb: { dreiecke, meshes, animationen[], materialien, texturen, fehler[], warnungen[] }.
 * Dreiecke = Summe der Primitive (Instanzen nicht mitgezählt).
 */
export function glbInfo(bytes) {
  const j = glbJson(bytes);
  const fehler = [];
  const warnungen = [];
  let dreiecke = 0;
  for (const m of j.meshes ?? [])
    for (const p of m.primitives ?? []) {
      const modus = p.mode ?? 4;
      const zugriff = j.accessors?.[p.indices ?? p.attributes?.POSITION];
      const n = zugriff?.count ?? 0;
      if (modus === 4) dreiecke += Math.floor(n / 3);
      else if (modus === 5 || modus === 6) dreiecke += Math.max(0, n - 2);
    }
  for (const ext of j.extensionsRequired ?? []) if (NICHT_UNTERSTUETZT[ext]) fehler.push(`${NICHT_UNTERSTUETZT[ext]} wird nicht unterstützt – bitte ohne Kompression exportieren`);
  for (const b of j.buffers ?? []) if (b.uri && !b.uri.startsWith('data:')) fehler.push(`Verweist auf externe Datei „${b.uri}“ – bitte als .glb mit allem eingebettet exportieren`);
  for (const b of j.images ?? []) if (b.uri && !b.uri.startsWith('data:')) fehler.push(`Textur „${b.uri}“ liegt extern – bitte einbetten`);
  if (!(j.meshes ?? []).length) fehler.push('Das Modell enthält keine Geometrie');
  if (dreiecke > WARN_DREIECKE) warnungen.push(`${dreiecke.toLocaleString('de-DE')} Dreiecke – viel fürs Spiel (Handy!), empfohlen < ${WARN_DREIECKE.toLocaleString('de-DE')}`);
  if (bytes.length > WARN_MB * 1024 * 1024) warnungen.push(`${(bytes.length / 1048576).toFixed(1)} MB – lädt langsam, empfohlen < ${WARN_MB} MB`);
  return {
    dreiecke,
    meshes: (j.meshes ?? []).length,
    animationen: (j.animations ?? []).map((a, i) => String(a.name || `Animation ${i + 1}`)),
    materialien: (j.materials ?? []).length,
    texturen: (j.textures ?? []).length,
    fehler,
    warnungen,
  };
}

const auf4 = (n) => (n + 3) & ~3;

/** Eingebettetes .gltf (JSON, Puffer als data:-URI) → .glb-Bytes. Externe Puffer → Fehler. */
export function gltfZuGlb(gltf) {
  const j = typeof gltf === 'string' ? JSON.parse(gltf) : structuredClone(gltf);
  if (!j?.asset?.version?.startsWith('2')) throw new Error('Kein glTF 2.0');
  const puffer = (j.buffers ?? []).map((b, i) => {
    if (!b.uri?.startsWith('data:')) throw new Error(`Puffer ${i} liegt extern („${b.uri ?? '?'}“) – bitte eingebettetes .gltf oder .glb verwenden`);
    return dataUrlZuBytes(b.uri);
  });
  const versatz = [];
  let gesamt = 0;
  for (const p of puffer) {
    versatz.push(gesamt);
    gesamt = auf4(gesamt + p.length);
  }
  const bin = new Uint8Array(gesamt);
  puffer.forEach((p, i) => bin.set(p, versatz[i]));
  for (const bv of j.bufferViews ?? []) {
    bv.byteOffset = (bv.byteOffset ?? 0) + versatz[bv.buffer ?? 0];
    bv.buffer = 0;
  }
  if (gesamt) j.buffers = [{ byteLength: gesamt }];
  else delete j.buffers;
  let json = new TextEncoder().encode(JSON.stringify(j));
  const jsonLaenge = auf4(json.length);
  const laenge = 12 + 8 + jsonLaenge + (gesamt ? 8 + gesamt : 0);
  const aus = new Uint8Array(laenge);
  const v = new DataView(aus.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, laenge, true);
  v.setUint32(12, jsonLaenge, true);
  v.setUint32(16, 0x4e4f534a, true);
  aus.fill(0x20, 20, 20 + jsonLaenge);
  aus.set(json, 20);
  if (gesamt) {
    v.setUint32(20 + jsonLaenge, gesamt, true);
    v.setUint32(24 + jsonLaenge, 0x004e4942, true);
    aus.set(bin, 28 + jsonLaenge);
  }
  json = null;
  return aus;
}

/** Dateiendung → Art: glb | gltf | obj | fbx | null */
export function modellFormat(dateiname) {
  const e = String(dateiname).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ['glb', 'gltf', 'obj', 'fbx'].includes(e) ? e : null;
}

// ---------------------------------------------------------------- Metadaten

const text = (w, max = 120) => (typeof w === 'string' ? w.trim().slice(0, max) : '');
const zahl = (w, min, max, std) => (Number.isFinite(Number(w)) ? Math.min(max, Math.max(min, Math.round(Number(w) * 100) / 100)) : std);

/** Tags aus "Baum, Wald  dunkel" oder Array → ['baum','wald','dunkel'] (klein, ohne Doppelte, max. 12) */
export function tagsAus(w) {
  const liste = Array.isArray(w) ? w : String(w ?? '').split(/[,;\s]+/);
  return [...new Set(liste.map((t) => String(t).trim().toLowerCase().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 12);
}

/** Metadaten prüfen/säubern (für Speichern, Backup-Import, Datei-Import) */
export function metaNormal(m = {}, id = m.id) {
  const masse = m.masse ?? {};
  return {
    id,
    name: text(m.name) || id,
    art: 'modell',
    kategorie: text(m.kategorie, 40) || 'Eigene',
    ordner: text(m.ordner, 60).replace(/[\\]+/g, '/').replace(/^\/+|\/+$/g, ''),
    tags: tagsAus(m.tags),
    lizenz: text(m.lizenz, 40),
    urheber: text(m.urheber),
    quelle: /^https?:\/\//.test(m.quelle ?? '') ? text(m.quelle, 300) : '',
    masse: { b: zahl(masse.b, 0.1, 40, 1), h: zahl(masse.h, 0.1, 40, 1), hoehe: zahl(masse.hoehe, 0.05, 40, 1) },
    dreiecke: Number.isFinite(m.dreiecke) ? m.dreiecke : 0,
    animationen: Array.isArray(m.animationen) ? m.animationen.map((a) => text(String(a), 60)).slice(0, 50) : [],
    vorschau: typeof m.vorschau === 'string' && /^data:image\/(png|webp|jpeg);base64,/.test(m.vorschau) && m.vorschau.length <= VORSCHAU_MAX ? m.vorschau : null,
    groesse: Number.isFinite(m.groesse) ? m.groesse : 0,
    erstellt: text(m.erstellt, 40) || null,
    // Werkstatt-Versionen (5.1): basis = ID des Originals, version = laufende Nummer (Original: ohne)
    ...(typeof m.basis === 'string' && /^m_[0-9a-z_]+$/.test(m.basis) && m.basis !== id ? { basis: m.basis, version: Number.isInteger(m.version) && m.version > 1 ? Math.min(m.version, 999) : 2 } : {}),
  };
}

/** Modellmaße (Meter aus dem glTF) → Fußabdruck in Kacheln (1 m = 1 Kachel), auf 0,1 gerundet */
export function masseAusGroesse({ x, y, z }) {
  const r = (w) => Math.min(40, Math.max(0.1, Math.round((w || 1) * 10) / 10));
  return { b: r(x), h: r(z), hoehe: Math.min(40, Math.max(0.05, Math.round((y || 1) * 100) / 100)) };
}

/** Suche über Name, Tags, Ordner, Kategorie, Urheber (Umlaute/Groß egal) */
export function passtModell(meta, suche) {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const heu = norm([meta.name, meta.ordner, meta.kategorie, meta.urheber, ...(meta.tags ?? []).map((t) => `#${t} ${t}`)].join(' '));
  return norm(suche).split(/\s+/).filter(Boolean).every((w) => heu.includes(w));
}

/** Freie Typ-ID für ein Modell in einer Karte: Name → 'm_baum', bei Kollision 'm_baum_2' … */
export function typIdFuer(name, belegt) {
  const basis = `m_${String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'modell'}`;
  let id = basis;
  for (let n = 2; belegt(id); n++) id = `${basis}_${n}`;
  return id;
}

/** Neuer Karten-Typ, der auf ein Bibliotheks-Modell verweist */
export function typAusModell(meta) {
  const t = { name: meta.name, kategorie: meta.kategorie || 'Eigene', b: meta.masse.b, h: meta.masse.h, hoehe3d: meta.masse.hoehe, blockiert: true, farbe: '#c080ff', asset: meta.id };
  if (meta.urheber) t.urheber = meta.urheber;
  if (meta.lizenz) t.lizenz = meta.lizenz;
  if (meta.quelle) t.quelle = meta.quelle;
  return t;
}

// ---------------------------------------------------------------- Auflösen (Spiel/Export) & Abhängigkeiten

let modellQuelle = () => null;
/** Der Browser-Teil (ui/bibliothek.js) meldet hier, wie man id → Data-URL bekommt. Tests können eine Map setzen. */
export function setzeModellQuelle(f) {
  modellQuelle = typeof f === 'function' ? f : () => null;
}
export const hatModell = (id) => !!modellQuelle(id);

/** Typ mit eingebettetem `glb` (falls er auf die Bibliothek verweist und das Modell da ist), sonst unverändert */
export function mitModell(typ) {
  if (!typ?.asset || typ.glb) return typ;
  const url = modellQuelle(typ.asset);
  return url ? { ...typ, glb: url } : typ;
}

/**
 * Wo wird ein Modell benutzt? zonen: Map id → EditorKarte.
 * @returns { zonen: [{ id, name, typen: [typId], objekte: n }], objekte, typen }
 */
export function verwendungen(zonen, assetIdWert) {
  const liste = [];
  let objekte = 0;
  let typen = 0;
  for (const [id, k] of zonen) {
    const t = [...k.s('typen')].filter(([, typ]) => typ.asset === assetIdWert).map(([tid]) => tid);
    if (!t.length) continue;
    const n = [...k.s('objekte').values()].filter((o) => t.includes(o.typ)).length;
    liste.push({ id, name: k.name, typen: t, objekte: n });
    objekte += n;
    typen += t.length;
  }
  return { zonen: liste, objekte, typen };
}

/** Ops für eine Zone: Typen des Modells + ihre Objekte löschen */
export function loeschOps(karte, assetIdWert) {
  const typen = [...karte.s('typen')].filter(([, t]) => t.asset === assetIdWert).map(([id]) => id);
  const ops = [...karte.s('objekte')].filter(([, o]) => typen.includes(o.typ)).map(([k]) => ({ s: 'objekte', k, neu: null }));
  return [...ops, ...typen.map((k) => ({ s: 'typen', k, neu: null })), ...typen.map((k) => karte.s('texturen').has(k) && { s: 'texturen', k, neu: null }).filter(Boolean)];
}

/** Ops für eine Zone: Typen des Modells auf ein anderes Modell umstellen (Maße bleiben, Objekte bleiben stehen) */
export function ersetzOps(karte, altId, neuMeta) {
  return [...karte.s('typen')].filter(([, t]) => t.asset === altId).map(([k, t]) => {
    const neu = { ...t, asset: neuMeta.id };
    delete neu.glb;
    for (const f of ['urheber', 'lizenz', 'quelle']) {
      if (neuMeta[f]) neu[f] = neuMeta[f];
      else delete neu[f];
    }
    return { s: 'typen', k, neu };
  });
}

/**
 * Alte Typen mit eingebettetem `glb` (vor Phase 3, Datei-Import, Backup) → Bibliothek. Ändert die Typen der (noch nicht
 * beobachteten) Karte direkt: `glb` raus, `asset` rein – verlustfrei, weil nachDefinition wieder einbettet.
 * @returns [{ id, bytes, meta }] neue Bibliotheks-Einträge (doppelte Dateien nur einmal)
 */
export function uebernimmEingebettete(karte) {
  const neu = new Map();
  for (const [typId, t] of karte.s('typen')) {
    if (!t.glb || typeof t.glb !== 'string' || !t.glb.startsWith('data:')) continue;
    let bytes;
    try {
      bytes = dataUrlZuBytes(t.glb);
    } catch {
      continue;
    }
    if (!istGlb(bytes)) continue;
    const id = assetId(bytes);
    if (!neu.has(id)) {
      let info = { dreiecke: 0, animationen: [] };
      try {
        info = glbInfo(bytes);
      } catch {
        /* nur Kennzahlen */
      }
      neu.set(id, { id, bytes, meta: metaNormal({ name: t.name ?? typId, kategorie: t.kategorie, lizenz: t.lizenz, urheber: t.urheber, quelle: t.quelle, masse: { b: t.b, h: t.h, hoehe: t.hoehe3d }, dreiecke: info.dreiecke, animationen: info.animationen, groesse: bytes.length, tags: [] }, id) });
    }
    delete t.glb;
    t.asset = id;
  }
  return [...neu.values()];
}

/** Export-Form (Backup/Entwurf-Datei): [{ ...meta, daten: Data-URL }] → geprüft zurück [{ id, bytes, meta }] */
export function leseBibliotheksExport(liste) {
  const aus = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    try {
      if (typeof e?.daten !== 'string' || !e.daten.startsWith('data:')) continue;
      const bytes = dataUrlZuBytes(e.daten);
      if (!istGlb(bytes)) continue;
      const id = assetId(bytes); // ID aus dem Inhalt – eine falsche ID in der Datei wird korrigiert
      aus.push({ id, bytes, meta: metaNormal({ ...e, groesse: bytes.length }, id), alteId: e.id });
    } catch {
      /* kaputter Eintrag → weglassen */
    }
  }
  return aus;
}

/** Asset-IDs, die eine Karte benutzt */
export function benutzteModelle(karte) {
  return [...new Set([...karte.s('typen').values()].map((t) => t.asset).filter(Boolean))];
}

// ================================================================ Audio (Editor 2.0, Phase 4)
// Gleiche Idee wie Modelle: Datei einmal im Projekt (IndexedDB-Bereich 'audio', ui/audioBibliothek.js), Klänge der Karte
// (Sammlung `klaenge`) verweisen per `audio: 'a_…'`; Export/Test betten `daten` (Data-URL) ein, karte:editor legt Dateien ab.

export const AUDIO_MAX_MB = 15;
export const WELLENFORM_PUNKTE = 160;

/** Audio-Format aus Dateiname oder MIME → Endung (mp3, wav, ogg, m4a, flac, opus, webm) oder null */
export function audioFormat(name = '', mime = '') {
  const e = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'mp4', 'aac', 'flac', 'opus', 'webm'].includes(e)) return { oga: 'ogg', mp4: 'm4a', aac: 'm4a' }[e] ?? e;
  const m = String(mime).toLowerCase();
  return m.includes('mpeg') ? 'mp3' : m.includes('wav') ? 'wav' : m.includes('ogg') ? 'ogg' : m.includes('flac') ? 'flac' : m.includes('mp4') || m.includes('aac') ? 'm4a' : m.includes('webm') ? 'webm' : null;
}

/** Datei-Signatur grob prüfen (vor dem Probe-Dekodieren): RIFF/WAVE, ID3/MPEG-Frame, OggS, fLaC, ftyp (m4a), EBML (webm) */
export function istAudio(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const t = (a, b) => String.fromCharCode(...bytes.subarray(a, b));
  return (t(0, 4) === 'RIFF' && t(8, 12) === 'WAVE') || t(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || t(0, 4) === 'OggS' || t(0, 4) === 'fLaC' || t(4, 8) === 'ftyp' || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3);
}

/** Wellenform: Spitzenwerte (0–1, 2 Stellen) aus PCM-Kanälen, `punkte` Säulen */
export function wellenform(kanaele, punkte = WELLENFORM_PUNKTE) {
  const n = kanaele[0]?.length ?? 0;
  if (!n) return [];
  const schritt = Math.max(1, Math.floor(n / punkte));
  const aus = [];
  for (let p = 0; p < punkte && p * schritt < n; p++) {
    let max = 0;
    for (const k of kanaele) for (let i = p * schritt, e = Math.min(n, (p + 1) * schritt); i < e; i += 4) max = Math.max(max, Math.abs(k[i]));
    aus.push(Math.round(Math.min(1, max) * 100) / 100);
  }
  return aus;
}

export function audioMetaNormal(m = {}, id = m.id) {
  return {
    id,
    name: text(m.name) || id,
    art: 'audio',
    ordner: text(m.ordner, 60).replace(/[\\]+/g, '/').replace(/^\/+|\/+$/g, ''),
    tags: tagsAus(m.tags),
    lizenz: text(m.lizenz, 40),
    urheber: text(m.urheber),
    quelle: /^https?:\/\//.test(m.quelle ?? '') ? text(m.quelle, 300) : '',
    format: audioFormat(`x.${m.format ?? ''}`) ?? 'mp3',
    dauer: zahl(m.dauer, 0, 36000, 0),
    kanaele: Math.round(zahl(m.kanaele, 1, 8, 2)),
    wellenform: Array.isArray(m.wellenform) ? m.wellenform.slice(0, WELLENFORM_PUNKTE).map((w) => zahl(w, 0, 1, 0)) : [],
    groesse: Number.isFinite(m.groesse) ? m.groesse : 0,
    erstellt: text(m.erstellt, 40) || null,
  };
}

/** Audio-Datei → Data-URL mit passendem MIME (Spiel/Browser erkennen das Format daran) */
export function bytesZuAudioUrl(bytes, format) {
  const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg', webm: 'audio/webm' }[format] ?? 'audio/mpeg';
  return `data:${mime};base64,${bytesZuBase64(bytes)}`;
}

let audioQuelle = () => null;
/** Browser (ui/audioBibliothek.js) bzw. editorImport.mjs melden id → Data-URL */
export function setzeAudioQuelle(f) {
  audioQuelle = typeof f === 'function' ? f : () => null;
}
export const hatAudio = (id) => !!audioQuelle(id);

/** Klang mit eingebetteten `daten` (falls er auf die Bibliothek verweist und die Datei da ist) */
export function mitAudio(klang) {
  if (!klang?.audio || klang.daten || klang.datei) return klang;
  const url = audioQuelle(klang.audio);
  return url ? { ...klang, daten: url } : klang;
}

/** Wo wird eine Audio-Datei benutzt? → { zonen: [{ id, name, klaenge: n }], klaenge } */
export function audioVerwendungen(zonen, id) {
  const liste = [];
  let n = 0;
  for (const [zid, k] of zonen) {
    const c = [...k.s('klaenge').values()].filter((x) => x.audio === id).length;
    if (c) liste.push({ id: zid, name: k.name, klaenge: c });
    n += c;
  }
  return { zonen: liste, klaenge: n };
}

export const audioLoeschOps = (karte, id) => [...karte.s('klaenge')].filter(([, x]) => x.audio === id).map(([k]) => ({ s: 'klaenge', k, neu: null }));
export const audioErsetzOps = (karte, alt, neu) => [...karte.s('klaenge')].filter(([, x]) => x.audio === alt).map(([k, x]) => ({ s: 'klaenge', k, neu: { ...x, audio: neu } }));

/** Eingebettete Klänge (daten aus Datei-Import/Testlauf) → Bibliothek; ändert die Karte direkt (vor dem Beobachten) */
export function uebernimmEingebetteteAudio(karte) {
  const neu = new Map();
  for (const [, k] of karte.s('klaenge')) {
    if (typeof k.daten !== 'string' || !k.daten.startsWith('data:audio/')) continue;
    let bytes;
    try {
      bytes = dataUrlZuBytes(k.daten);
    } catch {
      continue;
    }
    const id = assetId(bytes, 'a');
    if (!neu.has(id)) neu.set(id, { id, bytes, meta: audioMetaNormal({ name: k.name, format: audioFormat('', k.daten.slice(5, k.daten.indexOf(';'))), groesse: bytes.length }, id) });
    delete k.daten;
    k.audio = id;
  }
  return [...neu.values()];
}

export function leseAudioExport(liste) {
  const aus = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    try {
      if (typeof e?.daten !== 'string' || !e.daten.startsWith('data:audio/')) continue;
      const bytes = dataUrlZuBytes(e.daten);
      if (!istAudio(bytes)) continue;
      const id = assetId(bytes, 'a');
      aus.push({ id, bytes, meta: audioMetaNormal({ ...e, groesse: bytes.length }, id) });
    } catch {
      /* kaputt → weglassen */
    }
  }
  return aus;
}

export const benutzteAudios = (karte) => [...new Set([...karte.s('klaenge').values()].map((k) => k.audio).filter(Boolean))];
