/**
 * Klanglandschaft (Editor 2.0, Phase 4) – umgebungsfrei: Kartenlader (Server), Spiel-Client (client/audio/klaenge.js),
 * Map-Editor (Vorschau, Prüfung) und Tests (tests/klanglandschaft.test.js) benutzen dieselben Regeln.
 *
 * Ein Klang der Karte (`klaenge: [ … ]` im Kartenformat, Koordinaten in Kacheln):
 *   { id, name, audio? | daten? | datei?,          Quelle: Bibliotheks-ID (Editor) | Data-URL (Testlauf) | Pfad unter client/ (veröffentlicht)
 *     art: 'punkt' | 'bereich' | 'global',          punkt = Quelle mit Abfall, bereich = Ambiente im Rechteck, global = Karte (BGM)
 *     x, y, innen, aussen,                          punkt: Mitte + Radien (innen = volle Lautstärke, aussen = unhörbar)
 *     x, y, b, h, rand,                             bereich: Rechteck + Übergangsbreite (weiches Ein-/Ausblenden)
 *     start, ende, fadeIn, fadeOut, lautstaerke,    nicht-destruktive Bearbeitung (s; ende 0 = bis Dateiende; 0–2)
 *     bus: 'effekte' | 'atmosphaere' | 'musik',     Regler in den Einstellungen
 *     wiedergabe: 'loop' | 'intervall' | 'einmal',  intervall: [min, max] s Pause zwischen Wiederholungen
 *     ausloeser: s. AUSLOESER, naehe (Kacheln), abklingzeit (s), pitch (± % Zufall je Abspielen), ersetztMusik (global) }
 *
 * Wiedergabe-Modell: der Auslöser ist eine BEDINGUNG. loop = spielt, solange sie gilt (danach Ausblenden);
 * intervall = solange sie gilt, nach Zufallspausen erneut; einmal = beim Wechsel auf „gilt“, danach Abklingzeit.
 */
export const KLANG_ARTEN = Object.freeze(['punkt', 'bereich', 'global']);
export const WIEDERGABEN = Object.freeze(['loop', 'intervall', 'einmal']);
export const BUSSE = Object.freeze(['effekte', 'atmosphaere', 'musik']);
export const AUSLOESER = Object.freeze({
  immer: 'immer (solange hörbar)',
  drinnen: 'Bereich betreten / in Hörweite',
  verlassen: 'Bereich verlassen',
  naehe: 'Annäherung auf X Kacheln',
  tag: 'tagsüber',
  nacht: 'nachts',
  kampf: 'Kampf (Schuss/Treffer in den letzten 8 s)',
  horde: 'Horde unterwegs',
  zone: 'Zone betreten (Übergang)',
});
export const AUDIO_ENDUNGEN = Object.freeze(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus', 'webm']);
export const AUDIO_MIME = Object.freeze({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg', webm: 'audio/webm' });
export const KAMPF_DAUER = 8;
/** Leistungsgrenze im Spiel: so viele Klänge gleichzeitig (nächste zuerst) */
export const MAX_AKTIV = { handy: 6, desktop: 12 };

const zahl = (w, min, max, std) => (Number.isFinite(Number(w)) && w !== null && w !== '' ? Math.min(max, Math.max(min, Number(w))) : std);
const rund = (w, n = 100) => Math.round(w * n) / n;

/** Standardwerte je Art (für neue Klänge im Editor) */
export function neuerKlang(art = 'punkt', felder = {}) {
  const basis = { name: 'Klang', art, start: 0, ende: 0, fadeIn: art === 'punkt' ? 0.05 : 2, fadeOut: art === 'punkt' ? 0.2 : 2, lautstaerke: 1, bus: art === 'global' ? 'musik' : art === 'bereich' ? 'atmosphaere' : 'effekte', wiedergabe: 'loop', intervall: [5, 15], ausloeser: art === 'bereich' ? 'drinnen' : 'immer', naehe: 4, abklingzeit: 10, pitch: 0 };
  if (art === 'punkt') Object.assign(basis, { x: 0.5, y: 0.5, innen: 2, aussen: 10 });
  if (art === 'bereich') Object.assign(basis, { x: 0, y: 0, b: 6, h: 6, rand: 2 });
  if (art === 'global') basis.ersetztMusik = false;
  return { ...basis, ...felder };
}

/**
 * Klang prüfen/säubern (Lader, Editor-Import). Unbekanntes fällt weg, Zahlen werden begrenzt. Ohne Quelle → null.
 * @param {object} k Rohdaten  @param {{breite, hoehe}} groesse Kartengröße in Kacheln (für Positionen)
 */
export function pruefeKlang(k, { breite = 1e4, hoehe = 1e4 } = {}) {
  if (!k || typeof k !== 'object') return null;
  const art = KLANG_ARTEN.includes(k.art) ? k.art : 'punkt';
  const aus = { name: typeof k.name === 'string' ? k.name.slice(0, 60) : 'Klang', art };
  if (Number.isInteger(k.id)) aus.id = k.id;
  if (typeof k.datei === 'string' && /^audio\/karten\/[a-z0-9_]{1,40}\/[a-z0-9_.-]{1,80}\.(mp3|wav|ogg|m4a|flac|opus|webm)$/.test(k.datei)) aus.datei = k.datei;
  else if (typeof k.daten === 'string' && /^data:audio\/[a-z0-9.+-]+;base64,/.test(k.daten)) aus.daten = k.daten;
  else if (typeof k.audio === 'string' && /^a_[0-9a-f]{8}_[0-9a-z]{1,8}$/.test(k.audio)) aus.audio = k.audio;
  else return null;
  if (art === 'punkt') {
    aus.x = rund(zahl(k.x, 0, breite, 0));
    aus.y = rund(zahl(k.y, 0, hoehe, 0));
    aus.innen = rund(zahl(k.innen, 0, 200, 2));
    aus.aussen = rund(Math.max(aus.innen + 0.5, zahl(k.aussen, 0.5, 300, 10)));
  } else if (art === 'bereich') {
    aus.x = Math.round(zahl(k.x, 0, breite - 1, 0));
    aus.y = Math.round(zahl(k.y, 0, hoehe - 1, 0));
    aus.b = Math.round(zahl(k.b, 1, breite - aus.x, 1));
    aus.h = Math.round(zahl(k.h, 1, hoehe - aus.y, 1));
    aus.rand = rund(zahl(k.rand, 0, 50, 2));
  } else aus.ersetztMusik = k.ersetztMusik === true;
  aus.start = rund(zahl(k.start, 0, 3600, 0), 1000);
  aus.ende = rund(zahl(k.ende, 0, 3600, 0), 1000);
  if (aus.ende && aus.ende <= aus.start) aus.ende = 0;
  aus.fadeIn = rund(zahl(k.fadeIn, 0, 60, 0));
  aus.fadeOut = rund(zahl(k.fadeOut, 0, 60, 0));
  aus.lautstaerke = rund(zahl(k.lautstaerke, 0, 2, 1));
  aus.bus = BUSSE.includes(k.bus) ? k.bus : art === 'global' ? 'musik' : 'effekte';
  aus.wiedergabe = WIEDERGABEN.includes(k.wiedergabe) ? k.wiedergabe : 'loop';
  const iv = Array.isArray(k.intervall) ? k.intervall : [5, 15];
  const a = rund(zahl(iv[0], 0, 3600, 5));
  aus.intervall = [a, rund(Math.max(a, zahl(iv[1], 0, 3600, a)))];
  aus.ausloeser = Object.hasOwn(AUSLOESER, k.ausloeser) ? k.ausloeser : 'immer';
  aus.naehe = rund(zahl(k.naehe, 0.5, 200, 4));
  aus.abklingzeit = rund(zahl(k.abklingzeit, 0, 3600, 10));
  aus.pitch = rund(zahl(k.pitch, 0, 50, 0));
  return aus;
}

/** Abstand Punkt → Rechteck (0 innen), Kacheln */
function abstandRechteck(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.b));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}
/** Wie tief im Rechteck (0 am Rand, wächst nach innen), Kacheln */
function tiefeImRechteck(px, py, r) {
  return Math.min(px - r.x, r.x + r.b - px, py - r.y, r.y + r.h - py);
}

/**
 * Lautstärke-Faktor (0–1) und Stereo-Panorama (−1…1) eines Klangs für einen Hörer (Kacheln). Ohne die Grund-Lautstärke.
 * punkt: voll bis `innen`, dann linear bis 0 bei `aussen`, Panorama nach Richtung; bereich: im Inneren voll, über `rand`
 * Kacheln am Rand (innen) weich ein-/ausgeblendet; global: immer 1.
 */
export function pegel(k, hx, hy) {
  if (k.art === 'global') return { faktor: 1, pan: 0, abstand: 0 };
  if (k.art === 'bereich') {
    const tiefe = tiefeImRechteck(hx, hy, k);
    if (tiefe < 0) return { faktor: 0, pan: 0, abstand: abstandRechteck(hx, hy, k) };
    return { faktor: k.rand > 0 ? Math.min(1, tiefe / k.rand) : 1, pan: 0, abstand: 0 };
  }
  const abstand = Math.hypot(k.x - hx, k.y - hy);
  const faktor = abstand <= k.innen ? 1 : abstand >= k.aussen ? 0 : 1 - (abstand - k.innen) / (k.aussen - k.innen);
  const pan = abstand < 0.01 ? 0 : Math.max(-1, Math.min(1, (k.x - hx) / Math.max(k.innen, 3)));
  return { faktor, pan: rund(pan * Math.min(1, abstand / 2)), abstand };
}

/**
 * Gilt die Bedingung des Auslösers? kontext: { hx, hy (Hörer, Kacheln), nacht (bool), kampfSeit (s seit letztem Kampf, Infinity),
 * horde (bool), zoneSeit (s seit Betreten der Zone) }
 */
export function bedingung(k, kontext) {
  const { faktor, abstand } = pegel(k, kontext.hx, kontext.hy);
  const hoerbar = faktor > 0;
  switch (k.ausloeser) {
    case 'drinnen':
      return k.art === 'bereich' ? abstand === 0 && tiefeImRechteck(kontext.hx, kontext.hy, k) >= 0 : hoerbar;
    case 'verlassen':
      return k.art === 'bereich' ? tiefeImRechteck(kontext.hx, kontext.hy, k) < 0 : !hoerbar;
    case 'naehe':
      return k.art === 'punkt' ? abstand <= k.naehe : k.art === 'bereich' ? abstand <= k.naehe : true;
    case 'tag':
      return !kontext.nacht && hoerbar;
    case 'nacht':
      return !!kontext.nacht && hoerbar;
    case 'kampf':
      return (kontext.kampfSeit ?? Infinity) < KAMPF_DAUER && hoerbar;
    case 'horde':
      return !!kontext.horde && hoerbar;
    case 'zone':
      return (kontext.zoneSeit ?? Infinity) < 1;
    default:
      return hoerbar;
  }
}

/** Zufall mit Startwert (deterministisch für Tests): mulberry32 → () => [0, 1) */
export function zufallMit(startwert = 1) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tonhöhe für ein Abspielen: pitch ±% → Faktor (1 = unverändert) */
export const tonhoehe = (k, zufall = Math.random) => (k.pitch > 0 ? 1 + ((zufall() * 2 - 1) * k.pitch) / 100 : 1);

/** Abspiel-Länge (s) eines Durchgangs nach Schnitt; dauer = Dateilänge */
export const schnittDauer = (k, dauer) => Math.max(0.01, (k.ende > 0 ? Math.min(k.ende, dauer) : dauer) - Math.min(k.start, dauer));

/**
 * Zustandsautomat je Klang (rein, für Spiel und Editor-Vorschau). `schritt(dt, kontext)` liefert Befehle:
 *   { art: 'start', tonhoehe, loop }  · { art: 'stopp' } (ausblenden)  · und hält `laeuft`.
 * `fertig()` meldet, dass ein nicht-loopender Durchgang zu Ende ist (Abspieler ruft es beim Ende der Quelle).
 */
export class KlangSteuerung {
  constructor(klang, { zufall = Math.random, dauer = 1 } = {}) {
    this.klang = klang;
    this.zufall = zufall;
    this.dauer = dauer; // Dateilänge (s) – für Intervall ohne Ende-Rückmeldung
    this.laeuft = false;
    this.galt = false;
    this.warten = 0; // Intervall: Pause bis zum nächsten Durchgang / einmal: Abklingzeit
    this.restDurchgang = 0;
  }

  #pause() {
    const [a, b] = this.klang.intervall;
    return a + this.zufall() * (b - a);
  }

  #start(loop) {
    this.laeuft = true;
    this.restDurchgang = loop ? Infinity : schnittDauer(this.klang, this.dauer);
    return { art: 'start', tonhoehe: tonhoehe(this.klang, this.zufall), loop };
  }

  fertig() {
    this.laeuft = false;
    this.restDurchgang = 0;
  }

  schritt(dt, kontext) {
    const k = this.klang;
    const gilt = bedingung(k, kontext);
    const befehle = [];
    const steigend = gilt && !this.galt;
    this.galt = gilt;
    this.warten = Math.max(0, this.warten - dt);
    if (this.laeuft && this.restDurchgang !== Infinity) {
      this.restDurchgang -= dt;
      if (this.restDurchgang <= 0) {
        this.fertig();
        if (k.wiedergabe === 'intervall') this.warten = this.#pause();
      }
    }
    if (k.wiedergabe === 'loop') {
      if (gilt && !this.laeuft) befehle.push(this.#start(true));
      else if (!gilt && this.laeuft) {
        this.fertig();
        befehle.push({ art: 'stopp' });
      }
    } else if (k.wiedergabe === 'intervall') {
      if (gilt && !this.laeuft && this.warten <= 0) befehle.push(this.#start(false));
      else if (!gilt && this.laeuft && k.art !== 'punkt') {
        this.fertig();
        befehle.push({ art: 'stopp' });
      }
      if (steigend && !this.laeuft && this.warten <= 0 && !befehle.length) befehle.push(this.#start(false));
    } else if (steigend && this.warten <= 0 && !this.laeuft) {
      befehle.push(this.#start(false));
      this.warten = k.abklingzeit;
    }
    return befehle;
  }
}
