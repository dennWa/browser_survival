import { EREIGNISSE, SOUND_GRUPPEN, parseDateiname, pruefeSoundEinstellungen } from '../../client/audio/eigeneSounds.js';
import { MUSIK_HAUPTMENUE, MUSIK_ALLE, musikOrdner, pruefeMusikEinstellungen, istMusikDatei } from '../../client/audio/musikIndex.js';

/**
 * Audio-Zentrale (Editor Phase 10.3): Katalog ALLER Sounds und ALLER Musik des Spiels – reine Funktionen (Tests:
 * tests/audioZentrale.test.js). Quellen:
 *   • Ereignisse (client/audio/eigeneSounds.js EREIGNISSE) mit eigenen Dateien (eigene.json) > Samples (samples.json) > Synthese
 *   • Musik-Ordner (musik.json; hauptmenue, alle, je Zone) – je Titel ein Eintrag + je Ordner ein „Ordner“-Eintrag
 *   • Karten-Klänge (Klanglandschaft veröffentlichter Karten, `klaenge[].datei`)
 * Pfade sind relativ zur Projektwurzel (`client/audio/eigene/pistole.ogg`) – so schreibt sie auch der lokale Editor-Server.
 */
export const AUDIO_GRUPPEN = Object.freeze([
  { id: 'musik', name: 'Musik', symbol: '🎵' },
  { id: 'atmosphaere', name: 'Atmosphäre & Wetter', symbol: '🌦' },
  { id: 'tiere', name: 'Tiere', symbol: '🐄' },
  { id: 'kampf', name: 'Waffen & Kampf', symbol: '🔫' },
  { id: 'zombies', name: 'Zombies', symbol: '🧟' },
  { id: 'fahrzeuge', name: 'Fahrzeuge', symbol: '🚗' },
  { id: 'bauen', name: 'Bauen, Handwerk & Arbeit', symbol: '🔨' },
  { id: 'inventar', name: 'Inventar & Items', symbol: '🎒' },
  { id: 'oberflaeche', name: 'Oberfläche & Menüs', symbol: '🖱' },
  { id: 'karten', name: 'Karten-Klänge', symbol: '🔊' },
]);
const GRUPPE_VON_NAME = Object.fromEntries(SOUND_GRUPPEN.map((n) => [n, AUDIO_GRUPPEN.find((g) => g.name === n)?.id ?? 'oberflaeche']));

export const QUELLEN = Object.freeze({ eigen: 'Eigene Datei', sample: 'Mitgeliefertes Sample', synth: 'Synthetisch erzeugt', keine: 'Kein Ton (stumm)', datei: 'Datei' });

export const PFAD_EIGENE = 'client/audio/eigene/';
export const PFAD_SAMPLES = 'client/audio/samples/';
export const PFAD_MUSIK = 'client/musik/';
export const AUDIO_ENDUNGEN = ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'webm'];

/** Lesbarer Name eines Musik-Ordners */
export function ordnerName(ordner, zonenNamen = {}) {
  if (ordner === MUSIK_HAUPTMENUE) return 'Hauptmenü / Login';
  if (ordner === MUSIK_ALLE) return 'Alle Zonen';
  return `Zone ${zonenNamen[ordner] ?? ordner}`;
}

function ordnerWann(ordner, zonenNamen) {
  if (ordner === MUSIK_HAUPTMENUE) return 'läuft auf dem Login-Bildschirm (nach dem ersten Klick)';
  if (ordner === MUSIK_ALLE) return 'läuft in jeder Zone (zusätzlich zu deren eigenen Titeln)';
  return `läuft in der Zone „${zonenNamen[ordner] ?? ordner}“`;
}

const ohneEndung = (d) => d.replace(/\.[a-z0-9]+$/i, '');

/**
 * Katalog bauen.
 * @param d { eigene (eigene.json), einstellungen (eigene/einstellungen.json roh), samples (samples.json), synth (Liste Ereignisse mit
 *   Synthese), musik (musik.json), musikEinstellungen (client/musik/einstellungen.json roh), zonen ({id: name}),
 *   karten ([{ id, name, klaenge: [{ name, datei, art }] }]) }
 * @returns [{ id, art: 'ereignis'|'musik'|'musikOrdner'|'kartenklang', gruppe, name, wann, wo, quelle, dateien[], varianten,
 *   pegel, streuung, loop, geaendert, … }]
 */
export function baueKatalog({ eigene = {}, einstellungen = {}, samples = {}, synth = [], musik = {}, musikEinstellungen = {}, zonen = {}, karten = [] } = {}) {
  const liste = [];
  const e = pruefeSoundEinstellungen(einstellungen);
  const synthSet = new Set(synth);
  for (const [name, [gruppeName, wann, opt = {}]] of Object.entries(EREIGNISSE)) {
    const eigen = (eigene[name]?.dateien ?? []).map((datei) => PFAD_EIGENE + datei);
    const probe = (samples[name] ?? []).map((datei) => PFAD_SAMPLES + datei);
    const quelle = eigen.length ? 'eigen' : probe.length ? 'sample' : synthSet.has(name) ? 'synth' : 'keine';
    const dateien = eigen.length ? eigen : probe;
    liste.push({
      id: `ereignis:${name}`,
      art: 'ereignis',
      gruppe: GRUPPE_VON_NAME[gruppeName] ?? 'oberflaeche',
      name: lesbarerName(name),
      ereignis: name,
      wann,
      wo: `Ereignis „${name}“ · ${eigen.length ? PFAD_EIGENE : probe.length ? PFAD_SAMPLES : 'client/audio/sound.js'}`,
      quelle,
      dateien,
      eigeneDateien: eigen,
      sampleDateien: probe,
      varianten: dateien.length,
      pegel: e[name]?.lautstaerke ?? eigene[name]?.lautstaerke ?? 1,
      streuung: e[name]?.streuung ?? 0,
      verzoegerung: e[name]?.verzoegerung ?? 0,
      maxDauer: e[name]?.maxDauer ?? 0,
      einmal: !!e[name]?.einmal,
      loop: !!opt.loop,
      stumm: !!opt.stumm,
      geaendert: eigen.length > 0 || !!e[name],
    });
  }
  // Musik: bekannte Ordner (hauptmenue, alle, Zonen) + alles aus dem Index
  const me = pruefeMusikEinstellungen(musikEinstellungen);
  const ordnerListe = [...new Set([MUSIK_HAUPTMENUE, MUSIK_ALLE, ...Object.keys(zonen), ...musikOrdner(musik)])];
  for (const ordner of ordnerListe) {
    const titel = (Array.isArray(musik[ordner]) ? musik[ordner] : []).filter(istMusikDatei);
    const zufall = musik._optionen?.[ordner]?.zufall ?? me[ordner]?.zufall ?? true;
    liste.push({
      id: `musikOrdner:${ordner}`,
      art: 'musikOrdner',
      gruppe: 'musik',
      name: ordnerName(ordner, zonen),
      ordner,
      wann: ordnerWann(ordner, zonen),
      wo: `${PFAD_MUSIK}${ordner}/`,
      quelle: titel.length ? 'eigen' : 'keine',
      dateien: [],
      varianten: titel.length,
      titel,
      zufall: zufall !== false,
      pegel: 1,
      geaendert: false,
    });
    titel.forEach((datei, i) =>
      liste.push({
        id: `musik:${ordner}/${datei}`,
        art: 'musik',
        gruppe: 'musik',
        name: ohneEndung(datei),
        ordner,
        datei,
        position: i,
        wann: `${ordnerWann(ordner, zonen)} · Titel ${i + 1} von ${titel.length}${zufall === false ? ' (der Reihe nach)' : ' (zufällig)'}`,
        wo: `${PFAD_MUSIK}${ordner}/${datei}`,
        quelle: 'eigen',
        dateien: [`${PFAD_MUSIK}${ordner}/${datei}`],
        varianten: 1,
        pegel: 1,
        geaendert: true,
      }),
    );
  }
  for (const k of karten) {
    for (const klang of k.klaenge ?? []) {
      if (!klang.datei) continue;
      liste.push({
        id: `kartenklang:${k.id}:${klang.datei}`,
        art: 'kartenklang',
        gruppe: 'karten',
        name: klang.name || ohneEndung(klang.datei.split('/').at(-1)),
        karte: k.id,
        wann: `Karte „${k.name ?? k.id}“: ${{ punkt: 'Punkt-Klang', bereich: 'Ambiente-Bereich', global: 'überall (Karten-Musik/Atmo)' }[klang.art] ?? klang.art}`,
        wo: `client/${klang.datei}`,
        quelle: 'datei',
        dateien: [`client/${klang.datei}`],
        varianten: 1,
        pegel: klang.lautstaerke ?? 1,
        geaendert: false,
      });
    }
  }
  return liste;
}

/** "zombie_stoehnen" → "Zombie stöhnen" (bekannte Umlaut-Wörter nur in der Anzeige; „feuer“ bleibt „feuer“) */
const UMLAUTE = [['stoehnen', 'stöhnen'], ['faellt', 'fällt'], ['tuer', 'Tür'], ['ui ', 'Oberfläche: ']];
export function lesbarerName(ereignis) {
  let t = ereignis.replace(/_/g, ' ');
  for (const [a, b] of UMLAUTE) t = t.replace(new RegExp(`\\b${a}`, 'g'), b);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Filter: 'alle' | 'geaendert' (eigene Dateien/Einstellungen) | 'synth' (nur synthetisch) | 'fehlend' (stumm/leer) */
export const FILTER = Object.freeze({ alle: 'Alle', geaendert: 'Nur geänderte', synth: 'Nur synthetische', fehlend: 'Nur fehlende/stumme' });

export function filtereKatalog(liste, { suche = '', gruppe = null, filter = 'alle' } = {}) {
  const woerter = normal(suche).split(/\s+/).filter(Boolean);
  return liste.filter((e) => {
    if (gruppe && e.gruppe !== gruppe) return false;
    if (filter === 'geaendert' && !e.geaendert) return false;
    if (filter === 'synth' && e.quelle !== 'synth') return false;
    if (filter === 'fehlend' && e.quelle !== 'keine') return false;
    if (!woerter.length) return true;
    const heu = normal(`${e.name} ${e.ereignis ?? ''} ${e.wann} ${e.wo} ${QUELLEN[e.quelle] ?? ''} ${AUDIO_GRUPPEN.find((g) => g.id === e.gruppe)?.name ?? ''}`);
    return woerter.every((w) => heu.includes(w));
  });
}

function normal(t) {
  return String(t).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/** Anzahl je Gruppe (für die Gruppen-Leiste) */
export function zaehleGruppen(liste) {
  const n = Object.fromEntries(AUDIO_GRUPPEN.map((g) => [g.id, 0]));
  for (const e of liste) if (e.art !== 'musikOrdner') n[e.gruppe] = (n[e.gruppe] ?? 0) + 1;
  return n;
}

/** Dateiname säubern (für Musik-Titel): erlaubte Zeichen wie die Server-Pfadprüfung, max. 60 Zeichen */
export function saubererName(text) {
  const t = String(text ?? '')
    .normalize('NFC')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^\p{L}\p{N}_ ()\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/^[ .\-]+|[ .]+$/g, '');
  return t || 'titel';
}

/**
 * Ziel-Pfad zum Speichern.
 *   Ereignis: `ersetzen` → `<name>.<endung>`; sonst nächste freie Variante `<name>_<n>.<endung>`
 *   Musik-Ordner: `client/musik/<ordner>/<saubererName>.<endung>` (vorhandene Namen → ` (2)`, ` (3)` …)
 *   Musik-Titel (ersetzen): gleicher Name, neue Endung · Karten-Klang: gleicher Pfad (Endung muss passen)
 * @returns { pfad, loeschen: [pfade, die danach weg müssen] } | { fehler }
 */
export function zielPfad(eintrag, { endung, ersetzen = true, name = '' }) {
  if (!AUDIO_ENDUNGEN.includes(endung)) return { fehler: `Endung .${endung} nicht erlaubt` };
  if (eintrag.art === 'ereignis') {
    const n = eintrag.ereignis;
    if (ersetzen) {
      const pfad = `${PFAD_EIGENE}${n}.${endung}`;
      return { pfad, loeschen: eintrag.eigeneDateien.filter((p) => p !== pfad) };
    }
    const nummern = eintrag.eigeneDateien.map((p) => parseDateiname(p.split('/').at(-1))?.nummer ?? 0);
    const naechste = nummern.length ? Math.max(...nummern) + 1 : 1;
    return { pfad: `${PFAD_EIGENE}${n}_${naechste}.${endung}`, loeschen: [] };
  }
  if (eintrag.art === 'musikOrdner') {
    const basis = saubererName(name);
    const vorhanden = new Set(eintrag.titel.map((d) => ohneEndung(d).toLowerCase()));
    let kandidat = basis;
    for (let i = 2; vorhanden.has(kandidat.toLowerCase()); i++) kandidat = `${basis} (${i})`;
    return { pfad: `${PFAD_MUSIK}${eintrag.ordner}/${kandidat}.${endung}`, loeschen: [] };
  }
  if (eintrag.art === 'musik') {
    const pfad = `${PFAD_MUSIK}${eintrag.ordner}/${ohneEndung(eintrag.datei)}.${endung}`;
    return { pfad, loeschen: pfad === eintrag.dateien[0] ? [] : [eintrag.dateien[0]], umbenannt: pfad !== eintrag.dateien[0] ? { alt: eintrag.datei, neu: pfad.split('/').at(-1) } : null };
  }
  if (eintrag.art === 'kartenklang') {
    const alt = eintrag.dateien[0];
    if (!alt.toLowerCase().endsWith(`.${endung}`)) return { fehler: `Karten-Klang ist .${alt.split('.').at(-1)} – die Karte verweist darauf, darum muss die neue Datei dasselbe Format haben (unbearbeitet hochladen oder im Klanglandschaft-Inspektor ersetzen)` };
    return { pfad: alt, loeschen: [] };
  }
  return { fehler: 'Unbekannter Eintrag' };
}

/** Neue einstellungen.json (Sounds): Standardwerte (Pegel 1, Streuung 0, kein Loop-Wert) fliegen raus. werte = null → Eintrag weg */
export function setzeSoundEinstellung(alt, ereignis, werte) {
  const neu = { ...pruefeSoundEinstellungen(alt) };
  if (!werte) {
    delete neu[ereignis];
    return neu;
  }
  const e = { ...neu[ereignis], ...werte };
  const r = {};
  if (Number.isFinite(e.lautstaerke) && Math.abs(e.lautstaerke - 1) > 0.001) r.lautstaerke = Math.round(e.lautstaerke * 100) / 100;
  if (Number.isFinite(e.streuung) && e.streuung > 0.001) r.streuung = Math.round(e.streuung * 100) / 100;
  if (Number.isFinite(e.verzoegerung) && e.verzoegerung > 0.001) r.verzoegerung = Math.round(e.verzoegerung * 100) / 100;
  if (Number.isFinite(e.maxDauer) && e.maxDauer > 0.001) r.maxDauer = Math.round(e.maxDauer * 100) / 100;
  if (e.einmal === true) r.einmal = true;
  if (typeof e.loop === 'boolean') r.loop = e.loop;
  if (Object.keys(r).length) neu[ereignis] = r;
  else delete neu[ereignis];
  return neu;
}

/** Neue client/musik/einstellungen.json: Ordner-Reihenfolge/Zufall setzen */
export function setzeMusikEinstellung(alt, ordner, { reihenfolge, zufall } = {}) {
  const neu = { ...pruefeMusikEinstellungen(alt) };
  const e = { ...neu[ordner] };
  if (reihenfolge) e.reihenfolge = [...reihenfolge];
  if (zufall !== undefined) {
    if (zufall) delete e.zufall;
    else e.zufall = false;
  }
  if (e.reihenfolge?.length || e.zufall === false) neu[ordner] = e;
  else delete neu[ordner];
  return neu;
}

/** Element i um `richtung` (−1/+1) verschieben (Kopie; am Rand unverändert) */
export function verschiebe(liste, i, richtung) {
  const j = i + richtung;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return [...liste];
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}
