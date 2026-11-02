import { AudioWerk } from './audioWerk.js';
import { AUDIO_GRUPPEN, QUELLEN, baueKatalog, filtereKatalog, zaehleGruppen, setzeSoundEinstellung, setzeMusikEinstellung, verschiebe } from '../../editor/kern/audioKatalog.js';
import { STANDARD_BEARBEITUNG, istUnveraendert, pruefeBearbeitung } from '../../editor/kern/audioSchnitt.js';
import { SYNTH_EREIGNISSE } from '../../client/audio/sound.js';
import { PEGEL_MAX, STREUUNG_MAX, VERZOEGERUNG_MAX, MAX_DAUER_MAX } from '../../client/audio/eigeneSounds.js';
import { MUSIK_STANDARD, MUSIK_UEBERBLENDUNG_MAX, MUSIK_PAUSE_MAX } from '../../client/audio/musikIndex.js';
import { mischpult, ereignisPfad, musikPfad, wirksamerPegel, TAGESZEITEN, ORTE, WETTER } from '../kern/audio.js';
import { icon } from '../oberflaeche/icons.js';
import { dialog, formular, frage, esc } from '../oberflaeche/dialoge.js';

/**
 * Audio-Zentrale des Studios (Phase 2) – Vollbild-Ebene #audio über dem Karten-Editor.
 *   links   Suche, Gruppen (Mischpult · Musik · Atmosphäre … · Karten-Klänge), Einträge (editor/kern/audioKatalog.baueKatalog)
 *   rechts  Detail je Eintrag:
 *     Ereignis      Anhören, Einstellungen fürs Spiel (Pegel, Streuung, Verzögerung, max. Dauer, einmal, Faktor je Zone),
 *                   Dateien (anhören, bearbeiten, löschen), Datei importieren / vorhandene zuordnen
 *     Musik-Ordner  Titel (Reihenfolge ▲▼, anhören, bearbeiten, löschen), zufällig, Überblendung, Pause, Titel hinzufügen
 *     Musik-Titel / Karten-Klang  Datei bearbeiten
 *     Mischpult     Wetter × Tageszeit × Ort × Zone → Schichten wie im Spiel (gemeinsam/audio/umgebung.js), Pegel global +
 *                   Faktor je Zone, live mit dem ECHTEN Spiel-Sound (audioWerk.spielSound)
 *   Schnitt-Editor  Wellenform (Griffe ziehen = Start/Ende), Ein-/Ausblenden, Lautstärke dB, Normalisieren, Schleife +
 *                   Überblendung, Vorhören → Speichern als Ersatz/Variante/Musik-Titel (Opus-.ogg, sonst WAV)
 * Schreiben nur über den Hauptprozess (IPC audio.*: Projekt.schreibeAudio/kopiereAudio/loescheAudio/
 * speichereAudioEinstellungen → Indexe neu). KI/MCP: kern/kiAudio.js ruft dieselben Methoden.
 */
const ZENTRALE = 'browserSurvival.studio.audio';
const MISCH = 'mischpult';
const r2 = (v) => Math.round(v * 100) / 100;
const dauerText = (s) => (!Number.isFinite(s) ? '–' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${r2(s).toFixed(2).replace('.', ',')} s`);

export class AudioZentrale {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('audio');
    this.werk = new AudioWerk();
    this.offen = false;
    this.gruppe = MISCH;
    this.suche = '';
    this.gewaehlt = null;
    this.katalog = [];
    this.schnitt = null; // { quelle: { pfad?, puffer, name, bytes?, endung? }, e: Bearbeitung, analyse, ziel }
    this.misch = { wetter: 'klar', tageszeit: 'tag', ort: 'draussen', zone: '' };
    try {
      Object.assign(this.misch, JSON.parse(localStorage.getItem(ZENTRALE) || '{}').misch ?? {});
    } catch {
      // egal
    }
  }

  // ---------- Öffnen / Daten ----------
  async oeffne(id = null) {
    if (!this.gebaut) this.#baue();
    this.el.classList.add('offen');
    this.offen = true;
    await this.ladeDaten();
    if (id) this.waehle(id);
    else this.#zeichne();
  }

  schliesse() {
    this.werk.stopp();
    this.werk.mischpultStopp();
    this.el.classList.remove('offen');
    this.offen = false;
  }

  async #json(pfad) {
    try {
      const r = await fetch(`../${pfad}`, { cache: 'no-store' });
      return r.ok ? r.json() : {};
    } catch {
      return {};
    }
  }

  /** Indexe/Einstellungen/Zonen neu lesen → Katalog */
  async ladeDaten() {
    const [eigene, einstellungen, samples, musik, musikEinstellungen] = await Promise.all(['client/audio/eigene/eigene.json', 'client/audio/eigene/einstellungen.json', 'client/audio/samples/samples.json', 'client/musik/musik.json', 'client/musik/einstellungen.json'].map((p) => this.#json(p)));
    const zonen = {};
    for (const z of this.studio.zonenPanel?.liste ?? []) zonen[z.id] = z.name;
    const karten = [...this.studio.zonenKarten()].map(([id, k]) => ({ id, name: k.name ?? id, klaenge: [...k.s('klaenge').values()] }));
    this.daten = { eigene, einstellungen, samples, musik, musikEinstellungen, zonen, karten };
    this.einst = einstellungen;
    this.musikEinst = musikEinstellungen;
    this.katalog = baueKatalog({ ...this.daten, synth: SYNTH_EREIGNISSE });
    this.dateien = (await this.studio.nativ.aufruf('projekt.klangDateien').catch(() => [])).map((d) => `client/${d.pfad}`);
    return this.katalog;
  }

  /** Oberfläche neu zeichnen (nach KI-Änderungen) */
  aktualisiere() {
    if (this.offen) this.#zeichne();
  }

  eintrag(id = this.gewaehlt) {
    return this.katalog.find((e) => e.id === id) ?? null;
  }

  waehle(id) {
    if (id !== MISCH && !this.eintrag(id)) throw new Error(`Audio-Eintrag „${id}“ gibt es nicht (audio_liste)`);
    this.werk.stopp();
    this.gewaehlt = id;
    this.schnitt = null;
    if (id === MISCH) this.gruppe = MISCH;
    else if (this.gruppe !== this.eintrag(id).gruppe && this.gruppe !== 'suche') this.gruppe = this.eintrag(id).gruppe;
    this.#zeichne();
  }

  // ---------- Einstellungen ----------
  /** Ereignis-Einstellungen ändern (lautstaerke, streuung, verzoegerung, maxDauer, einmal, zonen {zone: f}) und speichern */
  async einstellen(ereignis, werte, { sofort = true } = {}) {
    this.einst = setzeSoundEinstellung(this.einst, ereignis, werte);
    if (werte.lautstaerke !== undefined) this.werk.pegelLive(ereignis, werte.lautstaerke);
    if (werte.zonen) for (const [z, f] of Object.entries(werte.zonen)) this.werk.zonenPegelLive(ereignis, z, f ?? 1);
    return this.#speichereEinstellungen(sofort);
  }

  async musikEinstellen(ordner, werte, { sofort = true } = {}) {
    this.musikEinst = setzeMusikEinstellung(this.musikEinst, ordner, werte);
    return this.#speichereEinstellungen(sofort);
  }

  #speichereEinstellungen(sofort) {
    clearTimeout(this.speicherZeit);
    const tun = async () => {
      await this.studio.nativ.aufruf('audio.einstellungen', { sound: this.einst, musik: this.musikEinst });
      await this.ladeDaten();
      if (this.offen) this.#zeichne({ nurListe: true });
      this.studio.hinweis('Audio-Einstellungen gespeichert (einstellungen.json, Index neu)', 'erfolg');
    };
    if (sofort) return tun();
    this.speicherZeit = setTimeout(() => tun().catch((f) => this.studio.hinweis(f.message, 'fehler')), 500);
    return null;
  }

  // ---------- Dateien ----------
  /** Datei/Puffer in den Schnitt-Editor laden. quelle = Pfad (string) oder { name, bytes } (Import) */
  async bearbeite(quelle, ziel = null) {
    let q;
    if (typeof quelle === 'string') q = { pfad: quelle, name: quelle.split('/').at(-1), puffer: await this.werk.lade(quelle, { neu: true }) };
    else q = { name: quelle.name, bytes: quelle.bytes, endung: quelle.name.split('.').at(-1).toLowerCase(), puffer: await this.werk.dekodiere(quelle.bytes), credits: quelle.credits };
    this.schnitt = { quelle: q, e: { ...STANDARD_BEARBEITUNG }, analyse: this.werk.analyse(q.puffer), ziel };
    if (this.offen) this.#zeichne();
    return this.schnitt;
  }

  /**
   * Bearbeitete Fassung speichern. ziel = { art: 'ereignis', ereignis, ersetzen } | { art: 'musik', ordner, name } |
   * { art: 'datei', pfad } (überschreibt, z. B. Musik-Titel/Karten-Klang). @returns geschriebener Pfad
   */
  async speichereSchnitt(ziel = this.schnitt?.ziel, e = this.schnitt?.e) {
    const s = this.schnitt;
    if (!s) throw new Error('Nichts im Schnitt-Editor – zuerst eine Datei laden');
    if (!ziel) throw new Error('Ziel fehlt (Ereignis, Musik-Ordner oder Datei)');
    const p = pruefeBearbeitung(e, s.quelle.puffer.duration);
    // Unbearbeiteter Import in kompaktem Format → Original-Bytes (keine Qualitätsverluste); sonst neu kodieren
    let bytes;
    let endung;
    if (s.quelle.bytes && istUnveraendert(p, s.quelle.puffer.duration) && ['ogg', 'mp3', 'm4a', 'opus', 'webm'].includes(s.quelle.endung)) {
      bytes = s.quelle.bytes;
      endung = s.quelle.endung;
    } else {
      const k = await this.werk.kodiere(this.werk.schneide(s.quelle.puffer, p), { musik: ziel.art === 'musik' });
      bytes = k.bytes;
      endung = k.endung;
    }
    let pfad;
    let loeschen = [];
    if (ziel.art === 'ereignis') {
      const vorhandene = this.daten.eigene[ziel.ereignis]?.dateien?.map((d) => `client/audio/eigene/${d}`) ?? [];
      pfad = ereignisPfad(ziel.ereignis, vorhandene, endung, { ersetzen: !!ziel.ersetzen });
      if (ziel.ersetzen) loeschen = vorhandene.filter((v) => v !== pfad);
    } else if (ziel.art === 'musik') pfad = musikPfad(ziel.ordner, ziel.name || s.quelle.name.replace(/\.[a-z0-9]+$/i, ''), this.daten.musik[ziel.ordner] ?? [], endung);
    else if (ziel.art === 'datei') {
      pfad = ziel.pfad;
      if (!pfad.toLowerCase().endsWith(`.${endung}`)) {
        if (/^client\/audio\/karten\//.test(pfad)) throw new Error(`Karten-Klang ist .${pfad.split('.').at(-1)}, die neue Fassung .${endung} – die Karte verweist auf den Dateinamen`);
        loeschen = [pfad];
        pfad = pfad.replace(/\.[a-z0-9]+$/i, `.${endung}`);
      }
    } else throw new Error('Ziel: ereignis, musik oder datei');
    await this.studio.nativ.aufruf('audio.schreiben', { pfad, bytes, credits: s.quelle.credits ?? null });
    for (const l of loeschen) await this.studio.nativ.aufruf('audio.loeschen', { pfad: l }).catch(() => {});
    this.werk.cache.delete(pfad);
    await this.ladeDaten();
    this.werk.spielSound({ neu: !!this.werk.sound }); // Mischpult hört die neue Datei
    this.schnitt = null;
    if (this.offen) this.#zeichne();
    this.studio.hinweis(`Gespeichert: ${pfad}`, 'erfolg');
    return pfad;
  }

  /** Vorhandene Datei einem Ereignis zuordnen (Kopie) – ersetzen = alle bisherigen eigenen Dateien des Ereignisses weg */
  async zuordnen(von, ereignis, { ersetzen = false } = {}) {
    const vorhandene = this.daten.eigene[ereignis]?.dateien?.map((d) => `client/audio/eigene/${d}`) ?? [];
    const nach = ereignisPfad(ereignis, vorhandene, von.split('.').at(-1).toLowerCase(), { ersetzen });
    await this.studio.nativ.aufruf('audio.kopieren', { von, nach });
    if (ersetzen) for (const l of vorhandene.filter((v) => v !== nach)) await this.studio.nativ.aufruf('audio.loeschen', { pfad: l }).catch(() => {});
    await this.ladeDaten();
    if (this.offen) this.#zeichne();
    return nach;
  }

  async musikTitelHinzu(von, ordner, name = null) {
    const nach = musikPfad(ordner, name || von.split('/').at(-1).replace(/\.[a-z0-9]+$/i, ''), this.daten.musik[ordner] ?? [], von.split('.').at(-1).toLowerCase());
    await this.studio.nativ.aufruf('audio.kopieren', { von, nach });
    await this.ladeDaten();
    if (this.offen) this.#zeichne();
    return nach;
  }

  async loesche(pfad) {
    const r = await this.studio.nativ.aufruf('audio.loeschen', { pfad });
    this.werk.cache.delete(pfad);
    await this.ladeDaten();
    if (this.offen) this.#zeichne();
    return r;
  }

  /** Anhören: Eintrag (zufällige Variante oder Synthese) oder Pfad */
  async anhoeren(ziel) {
    if (typeof ziel === 'string' && ziel.startsWith('client/')) return this.werk.spiele(await this.werk.lade(ziel));
    const e = this.eintrag(ziel);
    if (!e) return null;
    if (e.dateien?.length) return this.werk.spiele(await this.werk.lade(e.dateien[Math.floor(Math.random() * e.dateien.length)]));
    if (e.art === 'ereignis' && e.quelle === 'synth') return this.werk.spieleSynth(e.ereignis);
    return null;
  }

  // ---------- Mischpult ----------
  mischpultZustand(werte = {}) {
    Object.assign(this.misch, werte);
    try {
      localStorage.setItem(ZENTRALE, JSON.stringify({ misch: this.misch }));
    } catch {
      // egal
    }
    const zone = this.misch.zone || null;
    const schnee = zone ? !!this.studio.zonenKarten().get(zone)?.werte?.schnee : false;
    const schichten = mischpult({ ...this.misch, schneeZone: schnee }).map((s) => ({ ...s, pegel: wirksamerPegel(this.einst, s.name), zonenFaktor: zone ? (setzeSoundEinstellung(this.einst, s.name, {})[s.name]?.zonen?.[zone] ?? 1) : 1 }));
    if (this.mischLaeuft) this.werk.mischpultSpielen({ ...this.misch, zone, schneeZone: schnee });
    return { ...this.misch, schneeZone: schnee, schichten };
  }

  mischpultAn(an) {
    this.mischLaeuft = an;
    if (an) this.mischpultZustand();
    else this.werk.mischpultStopp();
  }

  // ---------- Aufbau ----------
  #baue() {
    this.gebaut = true;
    this.el.innerHTML = `
      <header class="ws-kopf">
        <button class="knopf flach" data-az="zurueck" data-tipp="Zurück zum Karten-Editor" data-kuerzel="Esc">${icon('pfeilRechts', 15)} Karten</button>
        <span class="ws-titel">${icon('audio', 16)} Audio-Zentrale <span class="neben" id="az-status"></span></span>
        <div class="ws-aktionen">
          <button class="knopf flach" data-az="stopp" data-tipp="Alles stoppen">${icon('stopp', 15)}</button>
          <button class="knopf flach" data-az="neuLaden" data-tipp="Neu einlesen">${icon('wiederholen', 15)}</button>
        </div>
      </header>
      <div class="az-mitte">
        <aside class="panel ws-links">
          <div class="ws-filter"><input class="feld" id="az-suche" placeholder="Suchen (Name, Ereignis, Datei)…" /></div>
          <div class="az-gruppen" id="az-gruppen"></div>
          <div class="panel-inhalt" id="az-liste"></div>
        </aside>
        <section class="panel az-detail"><div class="panel-inhalt" id="az-detail"></div></section>
      </div>`;
    const sicher = (f) => async (...a) => {
      try {
        await f(...a);
      } catch (e) {
        this.studio.hinweis(e.message, 'fehler');
      }
    };
    this.el.addEventListener('click', sicher((e) => this.#klick(e)));
    this.el.addEventListener('input', sicher((e) => this.#eingabe(e, false)));
    this.el.addEventListener('change', sicher((e) => this.#eingabe(e, true)));
    this.el.querySelector('#az-suche').addEventListener('input', (e) => {
      this.suche = e.target.value;
      this.#zeichne({ nurListe: true });
    });
    addEventListener('keydown', (e) => {
      if (!this.offen || document.getElementById('dialog-ebene').classList.contains('offen')) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.schliesse();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (this.werk.quelle) this.werk.stopp();
        else if (this.schnitt) this.#vorhoeren();
        else if (this.gewaehlt && this.gewaehlt !== MISCH) this.anhoeren(this.gewaehlt);
      }
      e.stopPropagation();
    }, true);
  }

  #liste() {
    if (this.gruppe === MISCH && !this.suche.trim()) return [];
    return filtereKatalog(this.katalog, { suche: this.suche, gruppe: this.suche.trim() ? null : this.gruppe });
  }

  #zeichne({ nurListe = false } = {}) {
    const z = zaehleGruppen(this.katalog);
    this.el.querySelector('#az-status').textContent = `${this.katalog.filter((e) => e.art === 'ereignis').length} Ereignisse · ${this.katalog.filter((e) => e.art === 'musik').length} Musik-Titel`;
    this.el.querySelector('#az-gruppen').innerHTML = [`<div class="az-gruppe ${this.gruppe === MISCH ? 'aktiv' : ''}" data-gruppe="${MISCH}">${icon('wolke', 14)} Mischpult (Umgebung)</div>`, ...AUDIO_GRUPPEN.map((g) => `<div class="az-gruppe ${this.gruppe === g.id ? 'aktiv' : ''}" data-gruppe="${g.id}">${icon(g.id === 'musik' ? 'audio' : g.id === 'karten' ? 'zone' : 'klang', 14)} ${esc(g.name)} <span class="neben">${z[g.id] ?? 0}</span></div>`)].join('');
    const liste = this.#liste();
    this.el.querySelector('#az-liste').innerHTML = liste.length
      ? liste.map((e) => `<div class="liste-eintrag ${e.id === this.gewaehlt ? 'aktiv' : ''}" data-id="${esc(e.id)}" title="${esc(e.wo)}"><button class="knopf flach ws-mini" data-anhoeren="${esc(e.id)}" title="Anhören">${icon('abspielen', 12)}</button><span>${esc(e.name)}</span><span class="neben">${e.art === 'musikOrdner' ? `${e.varianten} Titel` : e.art === 'ereignis' ? (e.quelle === 'eigen' ? `${e.varianten}×` : e.quelle === 'synth' ? 'Synth' : e.quelle === 'sample' ? 'Sample' : 'stumm') : ''}${Math.abs((e.pegel ?? 1) - 1) > 0.001 ? ` · ${Math.round(e.pegel * 100)} %` : ''}</span></div>`).join('')
      : this.gruppe === MISCH ? '<div class="insp-leer">Rechts: Wetter, Tageszeit und Zone wählen und die Umgebung so hören wie im Spiel.</div>' : '<div class="insp-leer">Nichts gefunden.</div>';
    if (nurListe && !this.schnitt) return;
    const d = this.el.querySelector('#az-detail');
    if (this.gruppe === MISCH && (!this.gewaehlt || this.gewaehlt === MISCH)) d.innerHTML = this.#mischpultHtml();
    else {
      const e = this.eintrag();
      d.innerHTML = (e ? this.#detailHtml(e) : '<div class="insp-leer">Links einen Klang wählen.</div>') + (this.schnitt ? this.#schnittHtml() : '');
    }
    if (this.schnitt) this.#welle();
  }

  #regler(name, wert, min, max, schritt, text) {
    return `<div class="insp-zeile"><span>${text}</span><div><input type="range" min="${min}" max="${max}" step="${schritt}" value="${wert}" data-wert="${name}" /><span class="neben az-zahl">${r2(wert)}</span></div></div>`;
  }

  #detailHtml(e) {
    const kopf = `<div class="insp-kopf" style="padding:12px"><div class="insp-symbol">${icon(e.art.startsWith('musik') ? 'audio' : 'klang', 18)}</div><div style="flex:1"><div class="insp-titel">${esc(e.name)}</div><div class="insp-unter">${esc(e.wann ?? '')}</div><div class="insp-unter">${esc(e.wo ?? '')} · ${esc(QUELLEN[e.quelle] ?? e.quelle)}</div></div><button class="knopf" data-anhoeren="${esc(e.id)}">${icon('abspielen', 13)} Anhören</button></div>`;
    const zonen = Object.entries(this.daten.zonen);
    if (e.art === 'ereignis') {
      const z = setzeSoundEinstellung(this.einst, e.ereignis, {})[e.ereignis]?.zonen ?? {};
      return `${kopf}
        <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Im Spiel</div>
          ${this.#regler('lautstaerke', e.pegel, 0, PEGEL_MAX, 0.05, 'Pegel')}
          ${this.#regler('streuung', e.streuung, 0, STREUUNG_MAX, 0.01, 'Tonhöhe ±')}
          ${this.#regler('verzoegerung', e.verzoegerung, 0, VERZOEGERUNG_MAX, 0.05, 'Verzögerung s')}
          ${this.#regler('maxDauer', e.maxDauer, 0, MAX_DAUER_MAX, 0.5, 'Max. Dauer s')}
          <div class="insp-zeile"><span>Einmal</span><label class="schalter"><input type="checkbox" data-wert="einmal" ${e.einmal ? 'checked' : ''} /> nicht neu starten, solange er läuft</label></div>
          <div class="insp-zeile"><span>Je Zone</span><div class="az-zonen">${Object.entries(z).map(([zone, f]) => `<span class="az-zone">${esc(this.daten.zonen[zone] ?? zone)} ×<input class="feld zahl" type="number" min="0" max="${PEGEL_MAX}" step="0.05" value="${f}" data-zone="${esc(zone)}" /><button class="knopf flach ws-mini" data-zoneweg="${esc(zone)}">${icon('schliessen', 11)}</button></span>`).join('')}<select class="feld" data-zoneneu><option value="">+ Zone …</option>${zonen.filter(([id]) => !(id in z)).map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></div></div>
        </div>
        <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Dateien (${e.eigeneDateien.length} eigene${e.sampleDateien.length ? `, ${e.sampleDateien.length} Samples` : ''})</div>
          ${[...e.eigeneDateien, ...e.sampleDateien].map((p) => this.#dateiZeile(p, p.startsWith('client/audio/eigene/'))).join('') || '<div class="neben">Keine Datei – im Spiel synthetisch oder stumm.</div>'}
          <div class="insp-knoepfe"><button class="knopf" data-az="import">${icon('hochladen', 13)} Datei importieren …</button><button class="knopf flach" data-az="zuordnen">Vorhandene Datei zuordnen …</button></div>
        </div>`;
    }
    if (e.art === 'musikOrdner') {
      const me = this.musikEinst[e.ordner] ?? {};
      return `${kopf}
        <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Abspielen</div>
          <div class="insp-zeile"><span>Reihenfolge</span><label class="schalter"><input type="checkbox" data-musik="zufall" ${e.zufall ? 'checked' : ''} /> zufällig</label></div>
          <div class="insp-zeile"><span>Überblendung</span><div><input type="range" min="0" max="${MUSIK_UEBERBLENDUNG_MAX}" step="0.5" value="${me.ueberblendung ?? MUSIK_STANDARD.ueberblendung}" data-musik="ueberblendung" /><span class="neben az-zahl">${me.ueberblendung ?? MUSIK_STANDARD.ueberblendung} s</span></div></div>
          <div class="insp-zeile"><span>Pause</span><div><input type="range" min="0" max="${MUSIK_PAUSE_MAX}" step="1" value="${me.pause ?? MUSIK_STANDARD.pause}" data-musik="pause" /><span class="neben az-zahl">${me.pause ?? MUSIK_STANDARD.pause} s</span></div></div>
          <div class="neben">Musik für einzelne Bereiche einer Zone: im Karten-Editor eine Klangzone (G → Klangzone) mit Bus „Musik“ und weichen Ein-/Ausblendzeiten.</div>
        </div>
        <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Titel (${e.titel.length})</div>
          ${e.titel.map((t, i) => `<div class="az-datei"><button class="knopf flach ws-mini" data-anhoeren="client/musik/${esc(e.ordner)}/${esc(t)}">${icon('abspielen', 12)}</button><span>${esc(t)}</span><button class="knopf flach ws-mini" data-hoch="${i}" title="nach oben">▲</button><button class="knopf flach ws-mini" data-runter="${i}" title="nach unten">▼</button><button class="knopf flach ws-mini" data-bearbeite="client/musik/${esc(e.ordner)}/${esc(t)}" title="Schneiden">${icon('skalieren', 12)}</button><button class="knopf flach ws-mini" data-loesche="client/musik/${esc(e.ordner)}/${esc(t)}" title="Löschen (Papierkorb)">${icon('loeschen', 12)}</button></div>`).join('') || '<div class="neben">Noch keine Titel.</div>'}
          <div class="insp-knoepfe"><button class="knopf" data-az="import">${icon('hochladen', 13)} Titel importieren …</button><button class="knopf flach" data-az="zuordnen">Vorhandene Datei …</button></div>
        </div>`;
    }
    return `${kopf}<div class="insp-abschnitt">${e.dateien.map((p) => this.#dateiZeile(p, true)).join('')}</div>`;
  }

  #dateiZeile(p, eigen) {
    return `<div class="az-datei"><button class="knopf flach ws-mini" data-anhoeren="${esc(p)}">${icon('abspielen', 12)}</button><span title="${esc(p)}">${esc(p.split('/').at(-1))}</span><button class="knopf flach ws-mini" data-bearbeite="${esc(p)}" title="Schneiden / bearbeiten">${icon('skalieren', 12)}</button>${eigen ? `<button class="knopf flach ws-mini" data-loesche="${esc(p)}" title="Löschen (Papierkorb)">${icon('loeschen', 12)}</button>` : ''}</div>`;
  }

  #schnittHtml() {
    const s = this.schnitt;
    const e = s.e;
    const a = s.analyse;
    const eintrag = this.eintrag();
    const ziele = [];
    if (eintrag?.art === 'ereignis') ziele.push(['variante', `Als neue Variante von „${eintrag.ereignis}“`], ['ersetzen', `„${eintrag.ereignis}“ ersetzen (alle eigenen Varianten)`]);
    if (eintrag?.art === 'musikOrdner') ziele.push(['musik', `Als Titel in ${eintrag.name}`]);
    if (s.quelle.pfad && !s.quelle.pfad.startsWith('client/audio/samples/')) ziele.push(['datei', `Datei ${s.quelle.pfad.split('/').at(-1)} überschreiben`]);
    if (!ziele.length && eintrag?.art === 'musik') ziele.push(['datei', 'Titel überschreiben']);
    s.zielArt ??= ziele[0]?.[0];
    return `<div class="insp-abschnitt az-schnitt"><div class="insp-abschnitt-titel">Schneiden: ${esc(s.quelle.name)}</div>
      <canvas class="az-welle" id="az-welle"></canvas>
      <div class="neben">${dauerText(a.dauer)} · ${a.kanaele === 1 ? 'Mono' : 'Stereo'} · ${a.rate} Hz · Spitze ${a.spitzeDb} dB · RMS ${a.rmsDb} dB · Stille: Anfang ${dauerText(a.stilleAnfang)}, Ende ${dauerText(a.stilleEnde)} — Griffe ziehen = Start/Ende</div>
      <div class="insp-xyz" style="grid-template-columns:repeat(4,1fr)">
        <label>Start<input class="feld" type="number" step="0.01" min="0" data-schnitt="start" value="${r2(e.start)}" /></label>
        <label>Ende<input class="feld" type="number" step="0.01" min="0" data-schnitt="ende" value="${r2(e.ende || a.dauer)}" /></label>
        <label>Ein s<input class="feld" type="number" step="0.05" min="0" data-schnitt="fadeIn" value="${r2(e.fadeIn)}" /></label>
        <label>Aus s<input class="feld" type="number" step="0.05" min="0" data-schnitt="fadeOut" value="${r2(e.fadeOut)}" /></label>
      </div>
      <div class="insp-zeile"><span>Lautstärke dB</span><div><input type="range" min="-24" max="12" step="0.5" value="${e.gainDb}" data-schnitt="gainDb" /><span class="neben az-zahl">${e.gainDb}</span></div></div>
      <div class="insp-zeile"><span></span><div><label class="schalter"><input type="checkbox" data-schnitt="normalisieren" ${e.normalisieren ? 'checked' : ''} /> normalisieren (−1 dB)</label> <label class="schalter"><input type="checkbox" data-schnitt="loop" ${e.loop ? 'checked' : ''} /> nahtlose Schleife</label></div></div>
      ${e.loop ? `<div class="insp-zeile"><span>Überblendung s</span><div><input type="range" min="0.02" max="2" step="0.02" value="${e.ueberblendung}" data-schnitt="ueberblendung" /><span class="neben az-zahl">${e.ueberblendung}</span></div></div>` : ''}
      ${s.quelle.bytes ? `<div class="insp-zeile"><span>Credits</span><div class="insp-xyz" style="grid-template-columns:repeat(3,1fr)"><input class="feld" placeholder="Urheber" data-credit="urheber" value="${esc(s.quelle.credits?.urheber ?? '')}" /><input class="feld" placeholder="Lizenz (CC0 …)" data-credit="lizenz" value="${esc(s.quelle.credits?.lizenz ?? '')}" /><input class="feld" placeholder="Quelle (URL)" data-credit="url" value="${esc(s.quelle.credits?.url ?? '')}" /></div></div>` : ''}
      <div class="insp-zeile"><span>Speichern als</span><select class="feld" data-zielart>${ziele.map(([k, t]) => `<option value="${k}" ${k === s.zielArt ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="insp-knoepfe"><button class="knopf" data-az="vorhoeren">${icon('abspielen', 13)} Vorhören</button><button class="knopf flach" data-az="stopp">${icon('stopp', 13)}</button><button class="knopf flach" data-az="stilleWeg">Stille abschneiden</button><button class="knopf flach" data-az="schnittZu">Verwerfen</button><button class="knopf primaer" data-az="schnittSpeichern" ${ziele.length ? '' : 'disabled'}>${icon('speichern', 13)} Speichern</button></div>
    </div>`;
  }

  #mischpultHtml() {
    const m = this.mischpultZustand();
    const sel = (name, werte, wert) => `<select class="feld" data-misch="${name}">${werte.map(([k, t]) => `<option value="${esc(k)}" ${k === wert ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const zonen = [['', '– keine (globaler Pegel) –'], ...Object.entries(this.daten.zonen)];
    return `<div class="insp-kopf" style="padding:12px"><div class="insp-symbol">${icon('wolke', 18)}</div><div style="flex:1"><div class="insp-titel">Mischpult – Umgebung & Wetter</div><div class="insp-unter">Dieselben Schichten und Stärken wie im Spiel (gemeinsam/audio/umgebung.js), gespielt vom echten Spiel-Sound.</div></div>
        <button class="knopf ${this.mischLaeuft ? 'primaer' : ''}" data-az="mischAn">${icon(this.mischLaeuft ? 'stopp' : 'abspielen', 13)} ${this.mischLaeuft ? 'Stopp' : 'Abspielen'}</button></div>
      <div class="insp-abschnitt"><div class="insp-xyz" style="grid-template-columns:repeat(4,1fr)">
        <label>Wetter ${sel('wetter', WETTER.map((w) => [w, w]), m.wetter)}</label>
        <label>Tageszeit ${sel('tageszeit', Object.keys(TAGESZEITEN).map((t) => [t, t]), m.tageszeit)}</label>
        <label>Ort ${sel('ort', Object.entries(ORTE), m.ort)}</label>
        <label>Zone ${sel('zone', zonen, m.zone)}</label>
      </div>${m.schneeZone ? '<div class="neben">Schneezone: Schneesturm statt Sturm, keine Grillen/Vögel.</div>' : ''}</div>
      <div class="insp-abschnitt"><div class="az-misch-kopf"><span>Schicht</span><span>Stärke jetzt</span><span>Pegel (alle Zonen)</span><span>${m.zone ? `Faktor in ${esc(this.daten.zonen[m.zone] ?? m.zone)}` : 'Faktor je Zone'}</span></div>
        ${m.schichten.map((s) => `<div class="az-misch ${s.aktiv ? '' : 'aus'}" title="${esc(s.wann)}"><span><button class="knopf flach ws-mini" data-id-wahl="ereignis:${s.name}" title="Ereignis öffnen">${esc(s.name)}</button></span><span><span class="az-balken"><span style="width:${Math.round(s.staerke * 100)}%"></span></span></span><span><input type="range" min="0" max="${PEGEL_MAX}" step="0.05" value="${s.pegel}" data-mischpegel="${s.name}" /><span class="neben az-zahl">${Math.round(s.pegel * 100)} %</span></span><span>${m.zone ? `<input type="range" min="0" max="${PEGEL_MAX}" step="0.05" value="${s.zonenFaktor}" data-mischzone="${s.name}" /><span class="neben az-zahl">×${r2(s.zonenFaktor)}</span>` : '<span class="neben">Zone wählen</span>'}</span></div>`).join('')}
        <div class="neben">Pegel und Zonen-Faktor landen in <code>client/audio/eigene/einstellungen.json</code> (Spiel liest sie über eigene.json). Ausgegraute Schichten sind bei dieser Auswahl still.</div>
      </div>`;
  }

  #welle() {
    const c = this.el.querySelector('#az-welle');
    if (!c || !this.schnitt) return;
    this.werk.zeichne(c, this.schnitt.quelle.puffer, this.schnitt.e, { kopf: this.werk.position() });
    if (!c.dataset.verbunden) {
      c.dataset.verbunden = '1';
      let griff = null;
      const zeit = (ev) => {
        const r = c.getBoundingClientRect();
        return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * this.schnitt.quelle.puffer.duration;
      };
      c.addEventListener('pointerdown', (ev) => {
        const t = zeit(ev);
        const e = this.schnitt.e;
        const d = this.schnitt.quelle.puffer.duration;
        const naehe = d * 0.03;
        griff = Math.abs(t - e.start) < naehe ? 'start' : Math.abs(t - (e.ende || d)) < naehe ? 'ende' : t < e.start ? 'start' : 'ende';
        c.setPointerCapture(ev.pointerId);
        bewege(ev);
      });
      const bewege = (ev) => {
        if (!griff) return;
        this.schnitt.e[griff] = r2(zeit(ev));
        this.schnitt.e = pruefeBearbeitung(this.schnitt.e, this.schnitt.quelle.puffer.duration);
        this.#welle();
      };
      c.addEventListener('pointermove', bewege);
      c.addEventListener('pointerup', () => {
        griff = null;
        this.#zeichne();
      });
    }
    if (this.werk.quelle) requestAnimationFrame(() => this.#welle());
  }

  #vorhoeren() {
    this.werk.spiele(this.schnitt.quelle.puffer, this.schnitt.e, () => this.#welle());
    this.#welle();
  }

  async #klick(ev) {
    const t = ev.target.closest('[data-az],[data-gruppe],[data-id],[data-anhoeren],[data-bearbeite],[data-loesche],[data-hoch],[data-runter],[data-zoneweg],[data-id-wahl]');
    if (!t) return;
    const d = t.dataset;
    const e = this.eintrag();
    if (d.anhoeren !== undefined) return this.anhoeren(d.anhoeren);
    if (d.gruppe) {
      this.gruppe = d.gruppe;
      if (d.gruppe === MISCH) this.gewaehlt = MISCH;
      return this.#zeichne();
    }
    if (d.idWahl) return this.waehle(d.idWahl);
    if (d.id) return this.waehle(d.id);
    if (d.bearbeite) return this.bearbeite(d.bearbeite, e?.art === 'ereignis' ? null : { art: 'datei', pfad: d.bearbeite });
    if (d.loesche) {
      if (!(await frage('Datei löschen?', `<code>${esc(d.loesche)}</code> wandert in <code>.studio/audio-papierkorb/</code>.`, { ja: 'Löschen', gefahr: true }))) return;
      return this.loesche(d.loesche);
    }
    if (d.hoch !== undefined || d.runter !== undefined) {
      const i = Number(d.hoch ?? d.runter);
      return this.musikEinstellen(e.ordner, { reihenfolge: verschiebe(e.titel, i, d.hoch !== undefined ? -1 : 1) });
    }
    if (d.zoneweg) return this.einstellen(e.ereignis, { zonen: { ...(setzeSoundEinstellung(this.einst, e.ereignis, {})[e.ereignis]?.zonen ?? {}), [d.zoneweg]: 1 } });
    switch (d.az) {
      case 'zurueck': return this.schliesse();
      case 'stopp':
        this.werk.stopp();
        return this.mischpultAn(false) ?? this.#zeichne();
      case 'neuLaden':
        await this.ladeDaten();
        return this.#zeichne();
      case 'mischAn':
        this.mischpultAn(!this.mischLaeuft);
        return this.#zeichne();
      case 'vorhoeren': return this.#vorhoeren();
      case 'schnittZu':
        this.werk.stopp();
        this.schnitt = null;
        return this.#zeichne();
      case 'stilleWeg': {
        const a = this.schnitt.analyse;
        this.schnitt.e = pruefeBearbeitung({ ...this.schnitt.e, start: Math.max(0, a.stilleAnfang - 0.01), ende: Math.min(a.dauer, a.dauer - a.stilleEnde + 0.02) }, a.dauer);
        return this.#zeichne();
      }
      case 'schnittSpeichern': {
        const art = this.schnitt.zielArt;
        const ziel = art === 'variante' || art === 'ersetzen' ? { art: 'ereignis', ereignis: e.ereignis, ersetzen: art === 'ersetzen' } : art === 'musik' ? { art: 'musik', ordner: e.ordner } : { art: 'datei', pfad: this.schnitt.quelle.pfad ?? e.dateien[0] };
        return this.speichereSchnitt(ziel);
      }
      case 'import': {
        const datei = await waehleDatei();
        if (!datei) return;
        await this.bearbeite({ name: datei.name, bytes: new Uint8Array(await datei.arrayBuffer()), credits: {} });
        return;
      }
      case 'zuordnen': {
        const f = formular([{ name: 'datei', titel: 'Datei', art: 'auswahl', wert: '', werte: this.dateien.map((p) => [p, p.replace(/^client\//, '')]) }, ...(e.art === 'ereignis' ? [{ name: 'ersetzen', titel: 'Ersetzen', art: 'schalter', text: 'bisherige eigene Dateien entfernen' }] : [])]);
        const w = await dialog({ titel: e.art === 'ereignis' ? `Datei „${e.ereignis}“ zuordnen` : `Titel zu ${e.name}`, icon: 'audio', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Zuordnen', art: 'primaer', wert: () => f.werte() }] });
        if (!w?.datei) return;
        return e.art === 'ereignis' ? this.zuordnen(w.datei, e.ereignis, { ersetzen: w.ersetzen }) : this.musikTitelHinzu(w.datei, e.ordner);
      }
      default:
        return undefined;
    }
  }

  async #eingabe(ev, fertig) {
    const t = ev.target;
    const d = t.dataset;
    const e = this.eintrag();
    const zahl = Number(t.value);
    const zeige = () => {
      const z = t.parentElement?.querySelector('.az-zahl');
      if (z) z.textContent = d.musik ? `${zahl} s` : d.mischpegel ? `${Math.round(zahl * 100)} %` : d.mischzone ? `×${r2(zahl)}` : r2(zahl);
    };
    if (d.wert && e?.art === 'ereignis') {
      zeige();
      if (t.type === 'checkbox') return fertig && this.einstellen(e.ereignis, { [d.wert]: t.checked ? true : undefined, ...(t.checked ? {} : { einmal: false }) });
      return this.einstellen(e.ereignis, { [d.wert]: zahl }, { sofort: false });
    }
    if (d.zone !== undefined && fertig) return this.einstellen(e.ereignis, { zonen: { ...(setzeSoundEinstellung(this.einst, e.ereignis, {})[e.ereignis]?.zonen ?? {}), [d.zone]: zahl } });
    if (d.zoneneu !== undefined && fertig && t.value) return this.einstellen(e.ereignis, { zonen: { ...(setzeSoundEinstellung(this.einst, e.ereignis, {})[e.ereignis]?.zonen ?? {}), [t.value]: 1.2 } });
    if (d.musik) {
      zeige();
      if (d.musik === 'zufall') return fertig && this.musikEinstellen(e.ordner, { zufall: t.checked });
      return this.musikEinstellen(e.ordner, { [d.musik]: zahl }, { sofort: false });
    }
    if (d.misch && fertig) {
      this.mischpultZustand({ [d.misch]: t.value });
      return this.#zeichne();
    }
    if (d.mischpegel) {
      zeige();
      return this.einstellen(d.mischpegel, { lautstaerke: zahl }, { sofort: false });
    }
    if (d.mischzone) {
      zeige();
      const n = d.mischzone;
      return this.einstellen(n, { zonen: { ...(setzeSoundEinstellung(this.einst, n, {})[n]?.zonen ?? {}), [this.misch.zone]: zahl } }, { sofort: false });
    }
    if (d.schnitt && this.schnitt) {
      const w = t.type === 'checkbox' ? t.checked : zahl;
      this.schnitt.e = pruefeBearbeitung({ ...this.schnitt.e, [d.schnitt]: w }, this.schnitt.quelle.puffer.duration);
      zeige();
      if (fertig || t.type === 'checkbox') this.#zeichne();
      else this.#welle();
      return undefined;
    }
    if (d.credit && this.schnitt) {
      this.schnitt.quelle.credits = { ...this.schnitt.quelle.credits, [d.credit]: t.value };
      return undefined;
    }
    if (t.dataset.zielart !== undefined && this.schnitt) this.schnitt.zielArt = t.value;
    return undefined;
  }
}

function waehleDatei() {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.ogg,.mp3,.wav,.m4a,.flac,.opus,.webm,audio/*';
    i.onchange = () => ok(i.files?.[0] ?? null);
    i.click();
  });
}
