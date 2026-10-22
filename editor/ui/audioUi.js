import { audioFormat, istAudio, wellenform, passtModell, audioVerwendungen, audioLoeschOps, audioErsetzOps, AUDIO_MAX_MB } from '../kern/bibliothek.js';
import { groesseText } from '../kern/backup.js';
import { neuerKlang, AUSLOESER, BUSSE, schnittDauer, tonhoehe } from '../../gemeinsam/audio/klanglandschaft.js';
import { dialog, bestaetigen, esc, feldHtml, liesFelder } from './dialoge.js';

/**
 * Reiter „🔊 Audio“ (linke Seitenleiste, Editor 2.0 Phase 4): Audio-Bibliothek des Projekts + Klänge der Zone.
 *   • Hochladen: Drag & Drop (mehrere) oder 📂 – mp3/wav/ogg/m4a/flac/opus/webm, max. AUDIO_MAX_MB; Signatur-Prüfung
 *     (kern/bibliothek.istAudio) + Probe-Dekodierung im Browser (Dauer, Kanäle, Wellenform). Ordner/Tags/Suche, ▶ Vorhören.
 *   • Platzieren: 📍 Punkt (Klick auf die Karte, auf ein Objekt = an dessen Mitte), ▭ Ambiente (Rechteck ziehen),
 *     🌐 Global (Karten-Musik, sofort angelegt). Werkzeug-Logik: ui/werkzeuge.js (`e.art === 'klang'`).
 *   • ✎ Details + 🗑 Löschen mit Abhängigkeitsprüfung (mitlöschen / durch andere Datei ersetzen; je Zone 1 Undo-Schritt).
 *   • Klang-Inspektor (`aktionen.klangFelder`, aufgerufen von ui/inspektor.js): Wellenform mit Trimm-Griffen (Start/Ende
 *     ziehen), Fades, Lautstärke, Bus, Wiedergabe/Auslöser, Pitch, Radien – nicht-destruktiv, jede Änderung 1 Undo-Schritt.
 *   • Vorhören (`Vorhoerer`) benutzt dieselben Regeln wie das Spiel (Schnitt, Fades, Pitch, Loop).
 * Aktionen: audioReiter, audioHochladen, klangSetzen(id, art), klangFelder(el, k, wert, setze, hilfen), vorhoeren(klang).
 */
const REITER = '🔊 Audio';
export const AUDIO_ANNAHME = '.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.opus,.webm,audio/*';
const ART_NAME = { punkt: '📍 Punkt-Klang', bereich: '▭ Ambiente (Bereich)', global: '🌐 Global (Karten-Musik)' };
const dauerText = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min` : `${(Math.round(s * 10) / 10).toString().replace('.', ',')} s`);

/** Vorhören im Editor: eine Stimme gleichzeitig, Puffer je URL zwischengespeichert */
export class Vorhoerer {
  constructor() {
    this.ctx = null;
    this.puffer = new Map();
    this.stimme = null;
    this.beiAenderung = null;
  }

  kontext() {
    if (!this.ctx) {
      const K = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!K) throw new Error('Kein Web-Audio in diesem Browser');
      this.ctx = new K();
    }
    this.ctx.resume?.();
    return this.ctx;
  }

  /** Bytes dekodieren (Kopie – decodeAudioData verbraucht den Puffer) */
  async dekodiere(bytes) {
    const ctx = this.kontext();
    return ctx.decodeAudioData(bytes.slice().buffer);
  }

  async #puffer(url) {
    if (!this.puffer.has(url)) {
      const p = fetch(url)
        .then((a) => a.arrayBuffer())
        .then((b) => this.kontext().decodeAudioData(b));
      p.catch(() => this.puffer.delete(url));
      this.puffer.set(url, p);
    }
    return this.puffer.get(url);
  }

  get laeuft() {
    return !!this.stimme;
  }

  /** klang = null → ganze Datei; sonst mit Schnitt, Fades, Lautstärke und (falls gesetzt) Tonhöhen-Streuung */
  async spiele(url, klang = null, { loop = false } = {}) {
    this.stoppe();
    const ctx = this.kontext();
    const puffer = await this.#puffer(url);
    const k = klang ?? { start: 0, ende: 0, fadeIn: 0, fadeOut: 0, lautstaerke: 1, pitch: 0 };
    const q = ctx.createBufferSource();
    q.buffer = puffer;
    const rate = tonhoehe(k);
    q.playbackRate.value = rate;
    const g = ctx.createGain();
    q.connect(g).connect(ctx.destination);
    const t = ctx.currentTime + 0.02;
    const start = Math.min(k.start, Math.max(0, puffer.duration - 0.01));
    const dauer = schnittDauer(k, puffer.duration);
    const pegel = Math.min(2, k.lautstaerke ?? 1) * 0.8;
    g.gain.setValueAtTime(k.fadeIn > 0 ? 0.0001 : pegel, t);
    if (k.fadeIn > 0) g.gain.linearRampToValueAtTime(pegel, t + Math.min(k.fadeIn, dauer));
    if (loop) {
      q.loop = true;
      q.loopStart = start;
      q.loopEnd = start + dauer;
      q.start(t, start);
    } else {
      const echt = dauer / rate;
      if (k.fadeOut > 0) {
        g.gain.setValueAtTime(pegel, t + Math.max(k.fadeIn, echt - k.fadeOut));
        g.gain.linearRampToValueAtTime(0.0001, t + echt);
      }
      q.start(t, start, dauer);
    }
    const stimme = { q, g };
    q.onended = () => {
      if (this.stimme === stimme) {
        this.stimme = null;
        this.beiAenderung?.();
      }
    };
    this.stimme = stimme;
    this.beiAenderung?.();
  }

  stoppe() {
    const s = this.stimme;
    if (!s) return;
    this.stimme = null;
    try {
      s.g.gain.setTargetAtTime(0.0001, s.q.context.currentTime, 0.03);
      s.q.stop(s.q.context.currentTime + 0.12);
    } catch {
      /* schon zu Ende */
    }
    this.beiAenderung?.();
  }
}

/** Audio-Datei lesen, prüfen und probeweise dekodieren → { bytes, meta } (meta ohne id) */
export async function leseAudioDatei(datei, vorhoerer) {
  const format = audioFormat(datei.name, datei.type);
  if (!format) throw new Error('Nur Audio: mp3, wav, ogg, m4a, flac, opus, webm');
  if (datei.size > AUDIO_MAX_MB * 1024 * 1024) throw new Error(`Datei zu groß (max. ${AUDIO_MAX_MB} MB) – lange Musik vorher kürzen oder als ogg/mp3 speichern`);
  const bytes = new Uint8Array(await datei.arrayBuffer());
  if (!istAudio(bytes)) throw new Error('Datei-Signatur passt nicht – keine Audio-Datei');
  let puffer;
  try {
    puffer = await vorhoerer.dekodiere(bytes);
  } catch (e) {
    throw new Error(`Der Browser kann die Datei nicht abspielen (${e?.message ?? 'Dekodieren fehlgeschlagen'})`);
  }
  const kanaele = [];
  for (let i = 0; i < puffer.numberOfChannels; i++) kanaele.push(puffer.getChannelData(i));
  const warnungen = [];
  if (puffer.duration > 300) warnungen.push(`${dauerText(puffer.duration)} lang – für Ambiente lieber kurze Schleifen (lädt schneller)`);
  if (bytes.length > 5 * 1024 * 1024) warnungen.push(`${groesseText(bytes.length)} – groß fürs Spiel (Handy!)`);
  return { bytes, meta: { format, dauer: Math.round(puffer.duration * 1000) / 1000, kanaele: puffer.numberOfChannels, wellenform: wellenform(kanaele) }, warnungen };
}

/** Wellenform als kleines SVG (für Listen) */
function wellenSvg(punkte, breite = 120, hoehe = 22) {
  if (!punkte?.length) return '';
  const w = breite / punkte.length;
  const balken = punkte.map((p, i) => `<rect x="${(i * w).toFixed(1)}" y="${((1 - p) * hoehe) / 2}" width="${Math.max(0.6, w - 0.4).toFixed(1)}" height="${Math.max(0.5, p * hoehe)}"/>`).join('');
  return `<svg class="welle" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}" aria-hidden="true">${balken}</svg>`;
}

export function audioUi({ zustand, panel, aktionen, layout, audioBibliothek: bib }) {
  const vorhoerer = new Vorhoerer();
  let suche = '';
  let ordner = '';
  let spieltId = null;
  const wurzel = document.createElement('div');
  wurzel.className = 'modelle audio';
  wurzel.innerHTML = `<button type="button" class="akzent az-oeffnen" data-zentrale title="Alle Sounds & Musik des Spiels: anhören, ersetzen, bearbeiten">🎵 Audio-Zentrale öffnen (alle Spiel-Sounds &amp; Musik)</button><div class="ablage" tabindex="0" title="Audio-Dateien hierher ziehen">⬇ mp3 / wav / ogg / m4a / flac hierher ziehen<br><button type="button" class="akzent" data-waehlen>📂 Dateien wählen …</button></div>
    <div class="modelle-filter"><input type="search" placeholder="Audio suchen … (#tag)" aria-label="Audio suchen"><select aria-label="Ordner"></select></div>
    <div class="audio-liste"></div><h5>Klänge dieser Zone</h5><div class="klang-liste"></div>`;
  const eingabe = wurzel.querySelector('input[type=search]');
  const ordnerWahl = wurzel.querySelector('select');
  const liste = wurzel.querySelector('.audio-liste');
  const zonenListe = wurzel.querySelector('.klang-liste');
  const ablage = wurzel.querySelector('.ablage');
  vorhoerer.beiAenderung = () => {
    if (!vorhoerer.laeuft) spieltId = null;
    if (panel.aktiv === REITER) zeichneListe();
    for (const k of document.querySelectorAll('[data-klang-hoeren]')) k.textContent = vorhoerer.laeuft ? '■ Stopp' : '▶ Vorhören';
  };

  eingabe.addEventListener('input', () => {
    suche = eingabe.value;
    zeichneListe();
  });
  eingabe.addEventListener('keydown', (e) => e.stopPropagation());
  ordnerWahl.addEventListener('change', () => {
    ordner = ordnerWahl.value;
    zeichneListe();
  });
  wurzel.querySelector('[data-waehlen]').addEventListener('click', () => waehleDateien());
  wurzel.querySelector('[data-zentrale]').addEventListener('click', () => aktionen.audioZentrale?.());
  for (const art of ['dragenter', 'dragover']) ablage.addEventListener(art, (e) => (e.preventDefault(), ablage.classList.add('ueber')));
  for (const art of ['dragleave', 'drop']) ablage.addEventListener(art, () => ablage.classList.remove('ueber'));
  ablage.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) hochladen([...e.dataTransfer.files]);
  });
  liste.addEventListener('click', (e) => {
    const zeile = e.target.closest('[data-audio]');
    const knopf = e.target.closest('button');
    if (!zeile || !knopf) return;
    const id = zeile.dataset.audio;
    const was = knopf.dataset.a;
    if (was === 'hoeren') {
      if (spieltId === id) return vorhoerer.stoppe();
      spieltId = id;
      vorhoerer.spiele(bib.url(id)).catch((f) => zustand.meldung(`Abspielen nicht möglich: ${f.message}`, 'fehler'));
    } else if (was === 'bearbeiten') bearbeiten(id);
    else if (was) aktionen.klangSetzen(id, was);
  });
  zonenListe.addEventListener('click', (e) => {
    const id = Number(e.target.closest('[data-klang]')?.dataset.klang);
    if (id) zustand.waehle([{ s: 'klaenge', k: id }]);
  });

  const karten = () => new Map([...zustand.zonen].map(([zid, e]) => [zid, e.karte]));

  function zeichneListe() {
    const alle = bib.liste;
    const ordnerListe = bib.ordner;
    ordnerWahl.innerHTML = `<option value="">Alle Ordner (${alle.length})</option>${ordnerListe.map((o) => `<option value="${esc(o)}"${o === ordner ? ' selected' : ''}>📁 ${esc(o)}</option>`).join('')}`;
    if (ordner && !ordnerListe.includes(ordner)) ordner = '';
    const treffer = alle.filter((m) => (!ordner || m.ordner === ordner || m.ordner.startsWith(`${ordner}/`)) && (!suche.trim() || passtModell(m, suche)));
    liste.innerHTML = !alle.length
      ? '<p class="leise">Noch keine Audio-Dateien. Datei hierher ziehen – sie liegt dann im Projekt (alle Zonen).</p>'
      : treffer.length
        ? treffer
            .map((m) => {
              const v = audioVerwendungen(karten(), m.id);
              return `<div class="audio-zeile" data-audio="${esc(m.id)}" title="${esc(`${m.name} · ${dauerText(m.dauer)} · ${m.format}${m.tags.length ? ` · #${m.tags.join(' #')}` : ''}`)}">
                <button type="button" data-a="hoeren" title="Vorhören">${spieltId === m.id ? '■' : '▶'}</button>
                <span class="name">${esc(m.name)}<span class="leise klein"> ${dauerText(m.dauer)}${v.klaenge ? ` · ${v.klaenge}× benutzt` : ''}</span>${wellenSvg(m.wellenform)}</span>
                <span class="knoepfe"><button type="button" data-a="punkt" title="Punkt-Klang: Klick auf die Karte (auf ein Objekt = daran)">📍</button><button type="button" data-a="bereich" title="Ambiente: Rechteck auf der Karte ziehen">▭</button><button type="button" data-a="global" title="Global: Musik/Atmo der ganzen Zone">🌐</button><button type="button" data-a="bearbeiten" title="Details / Löschen">✎</button></span></div>`;
            })
            .join('')
        : '<p class="leise">Nichts gefunden.</p>';
    const k = zustand.karte;
    const klaenge = k ? [...k.s('klaenge')] : [];
    zonenListe.innerHTML = klaenge.length
      ? klaenge.map(([id, c]) => `<button type="button" class="klang-eintrag${zustand.istGewaehlt('klaenge', id) ? ' aktiv' : ''}" data-klang="${id}">${c.art === 'global' ? '🌐' : c.art === 'bereich' ? '▭' : '📍'} ${esc(c.name)}${bib.meta(c.audio) || c.datei ? '' : ' <span style="color:var(--rot)">⚠ Datei fehlt</span>'}</button>`).join('')
      : '<p class="leise">Noch keine Klänge in dieser Zone.</p>';
  }

  panel.registriere(REITER, () => {
    if (panel.el.firstChild !== wurzel) panel.el.replaceChildren(wurzel);
    zeichneListe();
  }, { gruppe: '📁 Dateien', ereignisse: ['zone', 'bibliothek', 'auswahl'], ohneKarte: true }); // Runde 19: Modelle + Audio unter einem Reiter
  zustand.bei('karte', (ops) => ops.some((o) => o.s === 'klaenge') && panel.aktiv === REITER && zeichneListe());

  function waehleDateien() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: AUDIO_ANNAHME, multiple: true });
    input.addEventListener('change', () => input.files?.length && hochladen([...input.files]));
    input.click();
  }

  async function hochladen(dateien) {
    const fertig = [];
    const fehler = [];
    const hinweise = [];
    for (const [i, datei] of dateien.entries()) {
      zustand.meldung(`⟳ ${i + 1}/${dateien.length}: ${datei.name} wird geprüft …`);
      try {
        const a = await leseAudioDatei(datei, vorhoerer);
        const name = datei.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Klang';
        const { meta, neu } = await bib.fuegeHinzu(a.bytes, { ...a.meta, name, ordner, tags: [] });
        fertig.push(meta);
        if (!neu) hinweise.push(`${datei.name}: schon in der Bibliothek („${meta.name}“)`);
        hinweise.push(...a.warnungen.map((w) => `${datei.name}: ${w}`));
      } catch (e) {
        fehler.push(`${datei.name}: ${e.message}`);
      }
    }
    layout.zeigeReiter('links', REITER);
    zustand.meldung(`🔊 ${fertig.length} Audio-Datei${fertig.length === 1 ? '' : 'en'} in der Bibliothek${fehler.length ? `, ${fehler.length} abgelehnt` : ''}`, fehler.length ? 'fehler' : 'ok');
    if (fehler.length || hinweise.length) await dialog({ titel: '🔊 Hochladen', html: `${fehler.length ? `<p><b>Abgelehnt:</b></p><ul>${fehler.map((f) => `<li style="color:var(--rot)">${esc(f)}</li>`).join('')}</ul>` : ''}${hinweise.length ? `<p><b>Hinweise:</b></p><ul>${hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}` });
  }

  async function bearbeiten(id) {
    const m = bib.meta(id);
    if (!m) return;
    const v = audioVerwendungen(karten(), id);
    const felder = [
      { name: 'name', label: 'Name', typ: 'text', wert: m.name, pflicht: true },
      { name: 'ordner', label: 'Ordner', typ: 'text', wert: m.ordner, hilfe: 'z. B. Natur/Vögel' },
      { name: 'tags', label: 'Tags', typ: 'text', wert: m.tags.join(', '), hilfe: 'Komma-getrennt, für die Suche (#tag)' },
      { name: 'lizenz', label: 'Lizenz', typ: 'text', wert: m.lizenz },
      { name: 'urheber', label: 'Urheber', typ: 'text', wert: m.urheber },
      { name: 'quelle', label: 'Quelle (URL)', typ: 'text', wert: m.quelle },
    ];
    const kopf = `<div class="modell-kopf"><div>${wellenSvg(m.wellenform, 240, 48)}<p class="leise">${dauerText(m.dauer)} · ${m.kanaele === 1 ? 'Mono' : 'Stereo'} · ${esc(m.format)} · ${groesseText(m.groesse)}<br>${v.klaenge ? `Benutzt: ${v.zonen.map((z) => `${esc(z.name)} (${z.klaenge})`).join(', ')}` : 'In keiner Zone benutzt'}</p></div></div>`;
    const w = await dialog({
      titel: `🔊 ${m.name}`,
      html: kopf + felder.map(feldHtml).join(''),
      knoepfe: [{ text: '🗑 Löschen …', art: 'gefahr', wert: 'loeschen' }, { text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'akzent', wert: (b) => liesFelder(b, felder) }],
    });
    if (w === 'loeschen') return loeschen(id);
    if (!w) return;
    const neu = await bib.aendere(id, { name: w.name, ordner: w.ordner ?? '', tags: w.tags ?? '', lizenz: w.lizenz ?? '', urheber: w.urheber ?? '', quelle: w.quelle ?? '' });
    zustand.meldung(`🔊 „${neu?.name}“ gespeichert`, 'ok');
  }

  async function loeschen(id) {
    const m = bib.meta(id);
    const v = audioVerwendungen(karten(), id);
    if (!v.klaenge) {
      if (!(await bestaetigen('Audio löschen', `„${esc(m.name)}“ aus der Bibliothek löschen? Das geht nicht rückgängig (vorher: Datei → Komplett-Backup).`, { ok: 'Löschen', gefahr: true }))) return;
      vorhoerer.stoppe();
      await bib.entferne(id);
      return zustand.meldung(`🗑 „${m.name}“ gelöscht`, 'ok');
    }
    const andere = bib.liste.filter((x) => x.id !== id);
    const html = `<p>„${esc(m.name)}“ wird von <b>${v.klaenge} Klang/Klängen</b> in ${v.zonen.length} Zone(n) benutzt:</p>
      <ul>${v.zonen.map((z) => `<li>${esc(z.name)} (${esc(z.id)}): ${z.klaenge}</li>`).join('')}</ul>
      ${andere.length ? feldHtml({ name: 'ersatz', label: 'Ersetzen durch', typ: 'auswahl', wert: andere[0].id, optionen: andere.map((x) => [x.id, x.name]) }) : ''}
      <p class="leise">„Mitlöschen“ entfernt die Klänge in jeder Zone (je Zone rückgängig machbar), „Ersetzen“ behält Position, Schnitt und Auslöser. Die Datei selbst ist danach <b>nicht</b> wiederherstellbar.</p>`;
    const w = await dialog({
      titel: '🗑 Audio löschen',
      html,
      knoepfe: [{ text: 'Abbrechen', wert: null }, ...(andere.length ? [{ text: 'Ersetzen & löschen', wert: (b) => ({ art: 'ersetzen', ersatz: b.querySelector('[name=ersatz]').value }) }] : []), { text: `Mitlöschen (${v.klaenge})`, art: 'gefahr', wert: { art: 'mit' } }],
    });
    if (!w) return;
    for (const z of v.zonen) {
      const karte = zustand.zonen.get(z.id).karte;
      const ops = w.art === 'mit' ? audioLoeschOps(karte, id) : audioErsetzOps(karte, id, w.ersatz);
      zustand.ausfuehren(w.art === 'mit' ? `Klänge „${m.name}“ entfernt` : `Audio „${m.name}“ ersetzt`, ops, karte, { alleEbenen: true });
    }
    vorhoerer.stoppe();
    await bib.entferne(id);
    zustand.meldung(`🗑 „${m.name}“ gelöscht${w.art === 'mit' ? ` – ${v.klaenge} Klänge entfernt` : ` – ersetzt durch „${bib.meta(w.ersatz)?.name}“`}`, 'ok');
  }

  /** Klang aus einer Audio-Datei setzen: Punkt/Bereich → Werkzeug auf der Karte, Global → sofort (1 Undo-Schritt) */
  aktionen.klangSetzen = (id, art = 'punkt') => {
    const m = bib.meta(id);
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    if (!m) return;
    if (art === 'global') {
      const nr = k.naechsteId;
      zustand.ausfuehren(`Karten-Klang „${m.name}“`, [{ s: 'klaenge', k: nr, neu: neuerKlang('global', { name: m.name, audio: id, wiedergabe: 'loop' }) }]);
      zustand.waehle([{ s: 'klaenge', k: nr }]);
      return zustand.meldung(`🌐 „${m.name}“ spielt überall in der Zone – Einstellungen im Inspektor`, 'ok');
    }
    if (zustand.ansicht === '3d') return zustand.meldung('Klänge setzen geht in 2D – Taste 3 schaltet um', 'fehler');
    zustand.setzeEintrag({ id: `klang:${art}:${id}`, art: 'klang', klangArt: art, audio: id, name: m.name, kategorie: 'Klänge', symbol: art === 'bereich' ? '▭' : '🔊' });
    aktionen.werkzeug(art === 'bereich' ? 'bereich' : 'platzieren');
    zustand.meldung(art === 'bereich' ? `▭ „${m.name}“: Rechteck auf der Karte ziehen (Ambiente)` : `📍 „${m.name}“: Klick setzt den Klang (auf ein Objekt = daran, Umschalt = mehrere)`);
  };
  aktionen.audioReiter = () => layout.zeigeReiter('links', REITER);
  aktionen.audioHochladen = () => {
    layout.zeigeReiter('links', REITER);
    waehleDateien();
  };
  aktionen.vorhoeren = (klang, { loop = false } = {}) => {
    const url = klang.daten ?? bib.url(klang.audio) ?? (klang.datei ? `../client/${klang.datei}` : null);
    if (!url) return zustand.meldung('Audio-Datei fehlt in der Bibliothek', 'fehler');
    if (vorhoerer.laeuft) return vorhoerer.stoppe();
    vorhoerer.spiele(url, klang, { loop }).catch((f) => zustand.meldung(`Abspielen nicht möglich: ${f.message}`, 'fehler'));
  };

  /** Inspektor-Felder eines Klangs (ui/inspektor.js ruft das mit seinen Helfern felder/knoepfe auf) */
  aktionen.klangFelder = (el, schl, c, setze, { felder, knoepfe }) => {
    const k = zustand.karte;
    // immer vom aktuellen Stand ausgehen: der Inspektor zeichnet nach Änderungen verzögert neu (sonst überschreibt z. B.
    // ein Trimm-Zug eine eben geänderte Einblendzeit mit dem alten Wert)
    const aktuell = () => k.s('klaenge').get(schl) ?? c;
    const m = bib.meta(c.audio);
    const quellen = bib.liste.map((x) => [x.id, x.name]);
    if (c.audio && !m) quellen.unshift([c.audio, '⚠ fehlt in der Bibliothek']);
    el.insertAdjacentHTML('beforeend', `<p class="leise">${esc(ART_NAME[c.art])}${m ? ` · ${dauerText(m.dauer)}` : c.datei ? ` · ${esc(c.datei)}` : ''}</p>`);
    // Wellenform mit Trimm-Griffen (Start/Ende) und Fades
    if (m?.wellenform?.length) el.append(wellenEditor(c, m, ({ start, ende }) => setze('Schnitt', { ...aktuell(), start, ende })));
    knoepfe(el, [
      ['▶ Vorhören', () => aktionen.vorhoeren(aktuell())],
      ['🔁 Loop hören', () => aktionen.vorhoeren(aktuell(), { loop: true })],
    ]);
    el.querySelector('.knopfreihe:last-child button')?.setAttribute('data-klang-hoeren', '');
    const zahl = (wert) => (wert === null || wert === '' ? undefined : Number(wert));
    const liste = [
      { name: 'name', label: 'Name', typ: 'text', wert: c.name },
      ...(quellen.length ? [{ name: 'audio', label: 'Datei', typ: 'auswahl', wert: c.audio ?? '', optionen: quellen }] : []),
      { name: 'lautstaerke', label: 'Lautstärke', typ: 'zahl', wert: c.lautstaerke, min: 0, max: 2, schritt: 0.05, hilfe: '1 = Original, bis 2' },
      { name: 'bus', label: 'Regler', typ: 'auswahl', wert: c.bus, optionen: BUSSE.map((b) => [b, { effekte: 'Effekte', atmosphaere: 'Wind & Regen (Atmo)', musik: 'Musik' }[b]]), hilfe: 'welcher Lautstärke-Regler im Spiel gilt' },
      { name: 'start', label: 'Start (s)', typ: 'zahl', wert: c.start, min: 0, schritt: 0.01 },
      { name: 'ende', label: 'Ende (s)', typ: 'zahl', wert: c.ende || '', min: 0, schritt: 0.01, hilfe: 'leer = bis zum Dateiende' },
      { name: 'fadeIn', label: 'Einblenden (s)', typ: 'zahl', wert: c.fadeIn, min: 0, schritt: 0.05 },
      { name: 'fadeOut', label: 'Ausblenden (s)', typ: 'zahl', wert: c.fadeOut, min: 0, schritt: 0.05 },
      { name: 'wiedergabe', label: 'Wiedergabe', typ: 'auswahl', wert: c.wiedergabe, optionen: [['loop', 'Endlos-Schleife'], ['intervall', 'Zufällige Abstände'], ['einmal', 'Einmal je Auslösung']] },
      ...(c.wiedergabe === 'intervall' ? [{ name: 'intervallMin', label: 'Pause min (s)', typ: 'zahl', wert: c.intervall[0], min: 0, schritt: 0.5 }, { name: 'intervallMax', label: 'Pause max (s)', typ: 'zahl', wert: c.intervall[1], min: 0, schritt: 0.5 }] : []),
      { name: 'ausloeser', label: 'Auslöser', typ: 'auswahl', wert: c.ausloeser, optionen: Object.entries(AUSLOESER) },
      ...(c.ausloeser === 'naehe' ? [{ name: 'naehe', label: 'Nähe (Kacheln)', typ: 'zahl', wert: c.naehe, min: 0.5, schritt: 0.5 }] : []),
      ...(c.wiedergabe === 'einmal' ? [{ name: 'abklingzeit', label: 'Abklingzeit (s)', typ: 'zahl', wert: c.abklingzeit, min: 0, schritt: 1, hilfe: 'frühestens wieder nach …' }] : []),
      { name: 'pitch', label: 'Tonhöhe ± %', typ: 'zahl', wert: c.pitch, min: 0, max: 50, schritt: 1, hilfe: 'zufällige Variation je Abspielen (kurze Geräusche: 5–15)' },
      ...(c.art === 'punkt'
        ? [
            { name: 'x', label: 'x', typ: 'zahl', wert: c.x, schritt: 0.5 },
            { name: 'y', label: 'y', typ: 'zahl', wert: c.y, schritt: 0.5 },
            { name: 'innen', label: 'Voll bis (Kacheln)', typ: 'zahl', wert: c.innen, min: 0, schritt: 0.5, hilfe: 'innerer Kreis – auch per Griff auf der Karte' },
            { name: 'aussen', label: 'Hörweite (Kacheln)', typ: 'zahl', wert: c.aussen, min: 0.5, schritt: 0.5, hilfe: 'äußerer Kreis – auch per Griff auf der Karte' },
          ]
        : c.art === 'bereich'
          ? [
              { name: 'x', label: 'x', typ: 'zahl', wert: c.x, schritt: 1 },
              { name: 'y', label: 'y', typ: 'zahl', wert: c.y, schritt: 1 },
              { name: 'b', label: 'Breite', typ: 'zahl', wert: c.b, min: 1, schritt: 1 },
              { name: 'h', label: 'Höhe', typ: 'zahl', wert: c.h, min: 1, schritt: 1 },
              { name: 'rand', label: 'Übergang (Kacheln)', typ: 'zahl', wert: c.rand, min: 0, schritt: 0.5, hilfe: 'weiches Ein-/Ausblenden am Rand' },
            ]
          : [{ name: 'ersetztMusik', label: 'Ersetzt Zonen-Musik', typ: 'haken', wert: !!c.ersetztMusik, hilfe: 'an = Ordner-Musik der Zone schweigt' }]),
    ];
    felder(el, liste, (name, wert) => {
      const c = aktuell();
      const neu = { ...c };
      if (name === 'intervallMin' || name === 'intervallMax') {
        const a = name === 'intervallMin' ? Number(wert) : c.intervall[0];
        const b = name === 'intervallMax' ? Number(wert) : c.intervall[1];
        neu.intervall = [Math.min(a, b), Math.max(a, b)];
      } else if (name === 'ende') neu.ende = zahl(wert) ?? 0;
      else if (['name', 'audio', 'bus', 'wiedergabe', 'ausloeser'].includes(name)) neu[name] = wert;
      else if (name === 'ersetztMusik') neu.ersetztMusik = !!wert;
      else neu[name] = Number(wert);
      if (neu.art === 'punkt' && neu.aussen <= neu.innen) return zustand.meldung('Hörweite muss größer sein als „Voll bis“', 'fehler');
      if (neu.art === 'punkt' && (neu.x < 0 || neu.y < 0 || neu.x > k.breite || neu.y > k.hoehe)) return zustand.meldung('Außerhalb der Zone', 'fehler');
      if (neu.art === 'bereich' && (neu.x < 0 || neu.y < 0 || neu.b < 1 || neu.h < 1 || neu.x + neu.b > k.breite || neu.y + neu.h > k.hoehe)) return zustand.meldung('Bereich muss ganz in der Zone liegen', 'fehler');
      if (neu.ende && neu.ende <= neu.start) return zustand.meldung('Ende muss nach dem Start liegen', 'fehler');
      setze(name, neu);
    });
  };

  /**
   * Wellenform-Editor: Balken + abgedunkelte Bereiche außerhalb des Schnitts + Fade-Rampen. Griffe am Start/Ende
   * (Maus/Finger, 12 px) ziehen; erst beim Loslassen wird geändert (1 Undo-Schritt). Doppelklick = Schnitt zurücksetzen.
   */
  function wellenEditor(c, m, aendern) {
    const leinwand = document.createElement('canvas');
    leinwand.className = 'wellen-editor';
    leinwand.title = 'Griffe ziehen = Anfang/Ende schneiden · Doppelklick = zurücksetzen';
    const H = 64;
    let start = c.start;
    let ende = c.ende > 0 ? Math.min(c.ende, m.dauer) : m.dauer;
    let griff = null;
    const zeichne = () => {
      const B = leinwand.clientWidth || 260;
      const dpr = globalThis.devicePixelRatio || 1;
      leinwand.width = B * dpr;
      leinwand.height = H * dpr;
      const ctx = leinwand.getContext('2d');
      ctx.scale(dpr, dpr);
      const x = (s) => (s / m.dauer) * B;
      ctx.fillStyle = '#11161c';
      ctx.fillRect(0, 0, B, H);
      const w = B / m.wellenform.length;
      m.wellenform.forEach((p, i) => {
        const t = (i / m.wellenform.length) * m.dauer;
        ctx.fillStyle = t >= start && t <= ende ? '#4caf50' : '#3b4350';
        ctx.fillRect(i * w, ((1 - p) * H) / 2, Math.max(1, w - 0.5), Math.max(1, p * H));
      });
      // Fades als Rampen
      ctx.strokeStyle = '#f5b83d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(start), H - 2);
      ctx.lineTo(x(Math.min(ende, start + c.fadeIn)), 2);
      ctx.lineTo(x(Math.max(start, ende - c.fadeOut)), 2);
      ctx.lineTo(x(ende), H - 2);
      ctx.stroke();
      for (const s of [start, ende]) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x(s) - 1.5, 0, 3, H);
        ctx.fillRect(x(s) - 5, H / 2 - 9, 10, 18);
      }
      ctx.fillStyle = '#e4e7ec';
      ctx.font = '10px system-ui';
      ctx.fillText(`${dauerText(start)} – ${dauerText(ende)}`, 4, 11);
    };
    const zeit = (e) => {
      const r = leinwand.getBoundingClientRect();
      return Math.max(0, Math.min(m.dauer, ((e.clientX - r.left) / r.width) * m.dauer));
    };
    leinwand.addEventListener('pointerdown', (e) => {
      const r = leinwand.getBoundingClientRect();
      const px = e.clientX - r.left;
      const xs = (s) => (s / m.dauer) * r.width;
      const nahStart = Math.abs(px - xs(start));
      const nahEnde = Math.abs(px - xs(ende));
      if (Math.min(nahStart, nahEnde) > 14) return;
      griff = nahStart <= nahEnde ? 'start' : 'ende';
      leinwand.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    leinwand.addEventListener('pointermove', (e) => {
      if (!griff) return;
      const t = Math.round(zeit(e) * 100) / 100;
      if (griff === 'start') start = Math.min(t, ende - 0.05);
      else ende = Math.max(t, start + 0.05);
      zeichne();
    });
    const loslassen = () => {
      if (!griff) return;
      griff = null;
      const neuEnde = ende >= m.dauer - 0.01 ? 0 : ende;
      if (start !== c.start || neuEnde !== (c.ende || 0)) aendern({ ...c, start: Math.max(0, start), ende: neuEnde });
    };
    leinwand.addEventListener('pointerup', loslassen);
    leinwand.addEventListener('pointercancel', loslassen);
    leinwand.addEventListener('dblclick', () => (c.start || c.ende) && aendern({ ...c, start: 0, ende: 0 }));
    requestAnimationFrame(zeichne);
    return leinwand;
  }

  return { vorhoerer };
}
