import { KARTEN } from '../../server/spiel/karten/kartenLader.js';
import { Sound, SYNTH_EREIGNISSE } from '../../client/audio/sound.js';
import { AUDIO_GRUPPEN, QUELLEN, FILTER, baueKatalog, filtereKatalog, zaehleGruppen, zielPfad, setzeSoundEinstellung, setzeMusikEinstellung, verschiebe, saubererName } from '../kern/audioKatalog.js';
import { STANDARD_BEARBEITUNG, pruefeBearbeitung, bearbeite, istUnveraendert, ergebnisDauer, wellenformMinMax, bitrateFuer, groessenHinweis } from '../kern/audioSchnitt.js';
import { audioFormat, istAudio } from '../kern/bibliothek.js';
import { groesseText } from '../kern/backup.js';
import { kodiere, kannOpus } from './audioKodierer.js';
import { pruefeLokalenServer, istVerbunden, schreibeDatei, loescheDatei, LOKAL_HINWEIS } from './lokalerServer.js';
import { dialog, bestaetigen, esc } from './dialoge.js';

/**
 * 🎵 Audio-Zentrale (Editor Phase 10.3–10.5): eigenes Vollbild-Fenster mit ALLEN Sounds und ALLER Musik des Spiels.
 *   Links Gruppen (Musik · Atmosphäre · Tiere · Kampf · Zombies · Fahrzeuge · Bauen · Inventar · Oberfläche · Karten-Klänge),
 *   Mitte Liste (Suche, Filter, ▶ je Eintrag, Quelle/Dauer/Größe/Pegel/Varianten), rechts Details:
 *   • Anhören (Datei bzw. Synthese über `new Sound({ nurSynth: true })` – exakt der Spielklang), Pegel/Streuung fürs Spiel
 *     (`client/audio/eigene/einstellungen.json`), ↺ Original (eigene Dateien weg)
 *   • Hochladen (Knopf oder Drag & Drop, auch auf eine Listenzeile) → Bearbeiten: Wellenform mit Start/Ende-Griffen, Fades,
 *     Lautstärke/Normalisieren, Loop mit Überblendung, Vorhören (auch Schleife), ↶/↷ → „Übernehmen“ (Ersatz, Variante, Titel)
 *   • Speichern NUR der bearbeiteten Fassung (ui/audioKodierer.js: Ogg/Opus, sonst WAV) über den lokalen Editor-Server
 *     (ui/lokalerServer.js) – ohne Server Hinweis + Download der fertigen Datei.
 *   • Musik: Titel je Ordner hinzufügen, ↑/↓ Reihenfolge, 🗑, „der Reihe nach“ (client/musik/einstellungen.json).
 * Daten: kern/audioKatalog.js (Katalog/Pfade), kern/audioSchnitt.js (Schnitt), kern/oggOpus.js (Datei-Verpackung).
 * Öffnen: `aktionen.audioZentrale(id?)` (Befehl `audio.zentrale`, Schnellleiste, Reiter 🔊 Audio). Test: `aktiveZentrale()`.
 */
const ANNAHME = '.mp3,.ogg,.wav,.m4a,.flac,.opus,.webm,audio/*';
const UPLOAD_MAX_MB = 60;
const KOMPAKT = new Set(['ogg', 'mp3', 'm4a', 'opus', 'webm']);
const url = (pfad) => new URL(`../${pfad.split('/').map(encodeURIComponent).join('/')}`, location.href).href;
const dauerText = (s) => (!Number.isFinite(s) ? '–' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${(Math.round(s * 10) / 10).toFixed(1).replace('.', ',')} s`);
const prozent = (f) => `${Math.round(f * 100)} %`;

let offen = null;
export const aktiveZentrale = () => offen;

export function audioZentraleUi({ zustand, aktionen }) {
  aktionen.audioZentrale = (id = null) => {
    if (offen) return offen.waehle(id);
    offen = new AudioZentrale({ zustand, startId: id, beiZu: () => (offen = null) });
    return offen;
  };
}

async function liesJson(pfad, ersatz = {}) {
  try {
    const r = await fetch(url(pfad), { cache: 'no-store' });
    return r.ok ? await r.json() : ersatz;
  } catch {
    return ersatz;
  }
}

class AudioZentrale {
  constructor({ zustand, startId, beiZu }) {
    this.zustand = zustand;
    this.beiZu = beiZu;
    this.katalog = [];
    this.daten = null;
    this.gruppe = null;
    this.suche = '';
    this.filter = 'alle';
    this.gewaehlt = startId;
    this.info = new Map(); // pfad → { groesse, dauer }
    this.puffer = new Map(); // pfad → Promise<AudioBuffer>
    this.ctx = null;
    this.stimme = null;
    this.synth = null;
    this.synthTimer = null;
    this.laeuft = null; // Marke dessen, was gerade klingt: Eintrags-ID | 'datei:<pfad>' | 'vor' | 'vorSchleife' (→ Knöpfe zeigen ⏸)
    this.bearbeitung = null;
    this.handy = matchMedia('(max-width: 900px)').matches;
    this.#baue();
    this.tasten = (e) => this.#taste(e);
    window.addEventListener('keydown', this.tasten, true);
    this.bereit = this.neuLaden();
  }

  // --- Gerüst ------------------------------------------------------------------------------------------------------

  #baue() {
    const el = (this.el = document.createElement('div'));
    el.className = 'audiozentrale';
    el.innerHTML = `
      <header class="az-kopf">
        <b>🎵 Audio-Zentrale</b>
        <span class="az-status"></span>
        <input type="search" class="az-suche" placeholder="Suchen … (Name, Ereignis, Datei)" aria-label="Sounds suchen">
        <select class="az-filter" aria-label="Filter">${Object.entries(FILTER).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select>
        <span class="fueller"></span>
        <button type="button" data-a="zu" title="Schließen (Esc)">✕ Schließen</button>
      </header>
      <nav class="az-gruppen" aria-label="Gruppen"></nav>
      <div class="az-koerper">
        <div class="az-liste" role="list"></div>
        <section class="az-detail" aria-label="Details"><p class="leise">Links einen Eintrag wählen.</p></section>
      </div>
      <input type="file" class="az-datei" accept="${ANNAHME}" hidden>`;
    document.body.append(el);
    this.elListe = el.querySelector('.az-liste');
    this.elDetail = el.querySelector('.az-detail');
    this.elGruppen = el.querySelector('.az-gruppen');
    this.elDatei = el.querySelector('.az-datei');
    el.querySelector('[data-a=zu]').addEventListener('click', () => this.schliesse());
    const suche = el.querySelector('.az-suche');
    suche.addEventListener('input', () => {
      this.suche = suche.value;
      this.#zeichneListe();
    });
    suche.addEventListener('keydown', (e) => e.stopPropagation());
    el.querySelector('.az-filter').addEventListener('change', (e) => {
      this.filter = e.target.value;
      this.#zeichneListe();
    });
    this.elGruppen.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-gruppe]');
      if (!b) return;
      this.gruppe = b.dataset.gruppe || null;
      this.#zeichneGruppen();
      this.#zeichneListe();
    });
    this.elListe.addEventListener('click', (e) => {
      const zeile = e.target.closest('[data-id]');
      if (!zeile) return;
      if (e.target.closest('[data-a=spiele]')) return this.laeuft === zeile.dataset.id ? this.stoppe() : this.spiele(zeile.dataset.id);
      this.waehle(zeile.dataset.id);
    });
    // Datei auf eine Zeile ziehen = als Ersatz für diesen Eintrag hochladen
    this.elListe.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      this.elListe.querySelectorAll('.ziel').forEach((z) => z.classList.remove('ziel'));
      e.target.closest('[data-id]')?.classList.add('ziel');
    });
    this.elListe.addEventListener('drop', (e) => {
      const zeile = e.target.closest('[data-id]');
      const datei = e.dataTransfer?.files?.[0];
      zeile?.classList.remove('ziel');
      if (!zeile || !datei) return;
      e.preventDefault();
      this.waehle(zeile.dataset.id);
      this.ladeUpload(datei);
    });
    this.elDatei.addEventListener('change', () => {
      const d = this.elDatei.files?.[0];
      this.elDatei.value = '';
      if (d) this.ladeUpload(d);
    });
  }

  #taste(e) {
    if (document.getElementById('dialog-hintergrund')?.hidden === false) return;
    const inFeld = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.handy && this.el.classList.contains('detail-offen')) this.el.classList.remove('detail-offen');
      else this.schliesse();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && this.bearbeitung && !inFeld) {
      e.preventDefault();
      e.shiftKey ? this.wiederholen() : this.rueckgaengig();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && this.bearbeitung && !inFeld) {
      e.preventDefault();
      this.wiederholen();
    } else if (e.key === ' ' && !inFeld && this.gewaehlt) {
      e.preventDefault();
      this.laeuft ? this.stoppe() : this.bearbeitung ? this.vorhoeren() : this.spiele(this.gewaehlt);
    }
    // Fenster ist modal: keine Editor-Kürzel dahinter (Tippen in Feldern bleibt Standardverhalten)
    e.stopImmediatePropagation();
  }

  schliesse() {
    this.stoppe();
    window.removeEventListener('keydown', this.tasten, true);
    this.el.remove();
    this.ctx?.close?.();
    this.beiZu();
  }

  // --- Daten -------------------------------------------------------------------------------------------------------

  async neuLaden() {
    const lokal = await pruefeLokalenServer();
    const [eigene, einstellungen, samples, musik, musikEinstellungen] = await Promise.all([
      liesJson('client/audio/eigene/eigene.json'),
      liesJson('client/audio/eigene/einstellungen.json'),
      liesJson('client/audio/samples/samples.json'),
      liesJson('client/musik/musik.json'),
      liesJson('client/musik/einstellungen.json'),
    ]);
    const zonen = Object.fromEntries(Object.entries(KARTEN).map(([id, k]) => [id, k.name ?? id]));
    for (const e of this.zustand.zonen?.values?.() ?? []) zonen[e.karte.werte?.musik || e.karte.id] ??= e.karte.name;
    const karten = Object.entries(KARTEN).map(([id, k]) => ({ id, name: k.name, klaenge: k.klaenge ?? [] }));
    this.daten = { eigene, einstellungen, samples, musik, musikEinstellungen, zonen, karten };
    this.katalog = baueKatalog({ ...this.daten, synth: SYNTH_EREIGNISSE });
    this.el.querySelector('.az-status').innerHTML = lokal.verbunden
      ? '<span class="az-lokal ok" title="Änderungen werden direkt in die Projektordner geschrieben">🖥 lokal verbunden – speichert ins Projekt</span>'
      : `<span class="az-lokal" title="${esc(LOKAL_HINWEIS)}">🌐 nur anhören &amp; ausprobieren – zum Speichern: npm run editor:lokal</span>`;
    this.#zeichneGruppen();
    this.#zeichneListe();
    if (this.gewaehlt) this.#zeichneDetail();
    this.#ladeInfos();
  }

  eintrag(id = this.gewaehlt) {
    return this.katalog.find((e) => e.id === id) ?? null;
  }

  /** Größe (HEAD) + Dauer (Audio-Metadaten) im Hintergrund nachladen */
  async #ladeInfos() {
    const pfade = [...new Set(this.katalog.flatMap((e) => e.dateien))].filter((p) => !this.info.has(p));
    const eins = async (p) => {
      const i = { groesse: NaN, dauer: NaN };
      this.info.set(p, i);
      try {
        const r = await fetch(url(p), { method: 'HEAD', cache: 'no-store' });
        i.groesse = Number(r.headers.get('content-length'));
        i.fehlt = !r.ok;
      } catch {
        i.fehlt = true;
      }
      await new Promise((fertig) => {
        const a = new Audio();
        a.preload = 'metadata';
        const ende = () => {
          if (Number.isFinite(a.duration)) i.dauer = a.duration;
          a.src = '';
          fertig();
        };
        a.addEventListener('loadedmetadata', ende, { once: true });
        a.addEventListener('error', ende, { once: true });
        setTimeout(ende, 4000);
        a.src = url(p);
      });
    };
    let timer = null;
    const auffrischen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.el.isConnected && this.#aktualisiereZeilen(), 150);
    };
    const arbeiter = async () => {
      while (pfade.length) {
        await eins(pfade.shift());
        auffrischen();
      }
    };
    await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
  }

  #summe(e, feld) {
    const werte = e.dateien.map((p) => this.info.get(p)?.[feld]).filter(Number.isFinite);
    if (!werte.length) return NaN;
    return feld === 'groesse' ? werte.reduce((a, b) => a + b, 0) : Math.max(...werte);
  }

  // --- Anzeige -----------------------------------------------------------------------------------------------------

  #zeichneGruppen() {
    const n = zaehleGruppen(this.katalog);
    const gesamt = this.katalog.filter((e) => e.art !== 'musikOrdner').length;
    this.elGruppen.innerHTML = [`<button type="button" data-gruppe="" class="${this.gruppe ? '' : 'aktiv'}">📋 Alles <span class="leise">${gesamt}</span></button>`, ...AUDIO_GRUPPEN.map((g) => `<button type="button" data-gruppe="${g.id}" class="${this.gruppe === g.id ? 'aktiv' : ''}">${g.symbol} ${esc(g.name)} <span class="leise">${n[g.id] ?? 0}</span></button>`)].join('');
  }

  #zeile(e) {
    const groesse = this.#summe(e, 'groesse');
    const dauer = this.#summe(e, 'dauer');
    const badge = { eigen: 'eigen', sample: 'sample', synth: 'synth', keine: 'keine', datei: 'eigen' }[e.quelle];
    const ordner = e.art === 'musikOrdner';
    return `<div class="az-zeile${e.id === this.gewaehlt ? ' gewaehlt' : ''}${ordner ? ' ordner' : ''}" role="listitem" data-id="${esc(e.id)}" tabindex="0">
      <button type="button" data-a="spiele" title="Anhören (Leertaste)"${ordner && !e.titel.length ? ' disabled' : ''}>▶</button>
      <span class="az-name"><b>${ordner ? '📁 ' : ''}${esc(e.name)}${e.loop ? ' <span class="az-loop" title="Dauergeräusch (Schleife)">🔁</span>' : ''}</b><small>${esc(e.wann)}</small></span>
      <span class="az-badge ${badge}" title="${esc(QUELLEN[e.quelle])}">${esc(ordner ? `${e.titel.length} Titel` : QUELLEN[e.quelle])}</span>
      <span class="az-zahl az-varianten" title="Varianten (Spiel wählt zufällig)">${!ordner && e.varianten > 1 ? `×${e.varianten}` : ''}</span>
      <span class="az-zahl az-dauer">${e.quelle === 'synth' ? 'synth.' : ordner ? '' : dauerText(dauer)}</span>
      <span class="az-zahl az-groesse">${Number.isFinite(groesse) && groesse ? groesseText(groesse) : ''}</span>
      <span class="az-zahl az-pegel" title="Pegel im Spiel">${e.art === 'ereignis' && Math.abs(e.pegel - 1) > 0.001 ? prozent(e.pegel) : ''}</span>
    </div>`;
  }

  #zeichneListe() {
    const liste = filtereKatalog(this.katalog, { suche: this.suche, gruppe: this.gruppe, filter: this.filter });
    if (!liste.length) {
      this.elListe.innerHTML = '<p class="leise az-leer">Nichts gefunden.</p>';
      return;
    }
    let html = '';
    let gruppe = null;
    for (const e of liste) {
      if (e.gruppe !== gruppe && !this.gruppe) {
        gruppe = e.gruppe;
        const g = AUDIO_GRUPPEN.find((x) => x.id === gruppe);
        html += `<h4 class="az-ueberschrift">${g.symbol} ${esc(g.name)}</h4>`;
      }
      html += this.#zeile(e);
    }
    this.elListe.innerHTML = html;
    this.elListe.querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' });
    this.#marke(this.laeuft);
  }

  #aktualisiereZeilen() {
    for (const z of this.elListe.querySelectorAll('[data-id]')) {
      const e = this.eintrag(z.dataset.id);
      if (!e) continue;
      const g = this.#summe(e, 'groesse');
      const d = this.#summe(e, 'dauer');
      z.querySelector('.az-groesse').textContent = Number.isFinite(g) && g ? groesseText(g) : '';
      if (e.quelle !== 'synth' && e.art !== 'musikOrdner') z.querySelector('.az-dauer').textContent = dauerText(d);
    }
    if (this.gewaehlt && !this.bearbeitung) this.#infoZeile();
  }

  waehle(id) {
    if (!id) return this;
    if (this.bearbeitung && id !== this.gewaehlt) this.bearbeitung = null;
    this.gewaehlt = id;
    this.stoppe();
    for (const z of this.elListe.querySelectorAll('[data-id]')) z.classList.toggle('gewaehlt', z.dataset.id === id);
    this.elListe.querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' });
    this.el.classList.add('detail-offen');
    this.#zeichneDetail();
    return this;
  }

  #infoZeile() {
    const e = this.eintrag();
    const ziel = this.elDetail.querySelector('.az-dateien');
    if (!e || !ziel) return;
    ziel.innerHTML = e.dateien.length
      ? e.dateien.map((p, i) => {
          const inf = this.info.get(p) ?? {};
          return `<li><button type="button" data-a="datei" data-i="${i}" data-marke="datei:${esc(p)}" title="Diese Datei anhören">▶</button> <code>${esc(p)}</code> <span class="leise">${dauerText(inf.dauer)} · ${Number.isFinite(inf.groesse) && inf.groesse ? groesseText(inf.groesse) : '?'}${inf.fehlt ? ' · ⚠ fehlt' : ''}</span></li>`;
        }).join('')
      : `<li class="leise">${e.quelle === 'synth' ? 'Keine Datei – der Ton wird im Spiel erzeugt (client/audio/sound.js).' : e.art === 'musikOrdner' ? '' : 'Keine Datei.'}</li>`;
  }

  #zeichneDetail() {
    const e = this.eintrag();
    if (!e) {
      this.elDetail.innerHTML = '<p class="leise">Links einen Eintrag wählen.</p>';
      return;
    }
    const g = AUDIO_GRUPPEN.find((x) => x.id === e.gruppe);
    const kopf = `<div class="az-detail-kopf"><button type="button" class="nur-handy" data-a="zurueck">← Liste</button><h3>${g.symbol} ${esc(e.name)}</h3></div>
      <dl class="az-fakten">
        <dt>Wann?</dt><dd>${esc(e.wann)}</dd>
        <dt>Wo?</dt><dd><code>${esc(e.wo)}</code></dd>
        <dt>Quelle</dt><dd><span class="az-badge ${e.quelle === 'datei' ? 'eigen' : e.quelle}">${esc(e.art === 'musikOrdner' ? `${e.titel.length} Titel` : QUELLEN[e.quelle])}</span>${e.art === 'ereignis' && e.sampleDateien.length && e.quelle === 'eigen' ? ' <span class="leise">(ersetzt mitgelieferte Samples)</span>' : ''}${e.art === 'ereignis' && e.quelle === 'eigen' && !e.sampleDateien.length && SYNTH_EREIGNISSE.includes(e.ereignis) ? ' <span class="leise">(ersetzt Synthese)</span>' : ''}</dd>
        ${e.loop ? '<dt>Art</dt><dd>🔁 Dauergeräusch – läuft als Schleife (Ende muss in den Anfang passen → „Loop“ beim Bearbeiten)</dd>' : ''}
      </dl>
      <ul class="az-dateien liste"></ul>`;
    let mitte = '';
    if (e.art === 'ereignis') mitte = this.#ereignisHtml(e);
    else if (e.art === 'musikOrdner') mitte = this.#ordnerHtml(e);
    else if (e.art === 'musik') mitte = this.#titelHtml(e);
    else mitte = this.#kartenklangHtml(e);
    this.elDetail.innerHTML = kopf + mitte + (this.bearbeitung ? '<div class="az-werkbank"></div>' : this.#ablageHtml(e));
    this.#infoZeile();
    this.#bindeDetail(e);
    if (this.bearbeitung) this.#zeichneWerkbank();
    this.#marke(this.laeuft);
  }

  #ereignisHtml(e) {
    const loop = e.loop;
    return `<div class="az-block">
      <div class="knopfreihe">
        <button type="button" data-a="anhoeren" class="akzent" data-text="▶ Anhören${e.varianten > 1 ? ' (zufällige Variante)' : ''}">▶ Anhören${e.varianten > 1 ? ' (zufällige Variante)' : ''}</button>
        ${e.dateien.length ? '<button type="button" data-a="bearbeiten" title="Vorhandene Datei kürzen/anpassen und als eigene Datei speichern">✂ Datei bearbeiten</button>' : ''}
        ${e.quelle === 'eigen' || e.geaendert ? '<button type="button" data-a="original" class="gefahr" title="Eigene Dateien + Einstellungen entfernen">↺ Original</button>' : ''}
      </div>
      <h4>Im Spiel</h4>
      <label class="az-regler">Pegel <input type="range" min="0" max="300" step="5" value="${Math.round(e.pegel * 100)}" data-f="pegel"> <output>${prozent(e.pegel)}</output></label>
      ${loop ? '' : `<label class="az-regler" title="Jedes Abspielen klingt minimal anders – gut für kurze, oft wiederholte Sounds">Tonhöhen-Streuung ± <input type="range" min="0" max="50" step="1" value="${Math.round(e.streuung * 100)}" data-f="streuung"> <output>${Math.round(e.streuung * 100)} %</output></label>`}
      <div class="knopfreihe"><button type="button" data-a="einstellungen">💾 Einstellungen speichern</button><span class="leise">gilt für alle Quellen (auch Synthese/Samples)</span></div>
    </div>`;
  }

  #ordnerHtml(e) {
    return `<div class="az-block">
      <label class="haken"><input type="checkbox" data-f="reihe"${e.zufall ? '' : ' checked'}> der Reihe nach spielen (sonst zufällig)</label>
      <ol class="az-titel">${e.titel.map((d, i) => `<li><button type="button" data-a="titelSpielen" data-i="${i}" data-marke="datei:client/musik/${esc(e.ordner)}/${esc(d)}" title="Anhören">▶</button> <span>${esc(d)}</span> <span class="fueller"></span><button type="button" data-a="hoch" data-i="${i}" title="Nach oben"${i ? '' : ' disabled'}>↑</button><button type="button" data-a="runter" data-i="${i}" title="Nach unten"${i < e.titel.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-a="titelWeg" data-i="${i}" class="gefahr" title="Titel entfernen">🗑</button></li>`).join('') || '<li class="leise">Noch keine Titel – unten hochladen. Ohne Titel bleibt es hier still.</li>'}</ol>
    </div>`;
  }

  #titelHtml(e) {
    return `<div class="az-block"><div class="knopfreihe">
      <button type="button" data-a="anhoeren" class="akzent" data-text="▶ Anhören">▶ Anhören</button>
      <button type="button" data-a="bearbeiten">✂ Bearbeiten</button>
      <button type="button" data-a="hoch"${e.position ? '' : ' disabled'}>↑ früher</button><button type="button" data-a="runter">↓ später</button>
      <button type="button" data-a="titelWeg" class="gefahr">🗑 Entfernen</button>
      <button type="button" data-a="ordner">📁 Ordner</button></div></div>`;
  }

  #kartenklangHtml(e) {
    return `<div class="az-block"><div class="knopfreihe"><button type="button" data-a="anhoeren" class="akzent" data-text="▶ Anhören">▶ Anhören</button><button type="button" data-a="bearbeiten">✂ Bearbeiten</button></div>
      <p class="leise">Gehört zur Klanglandschaft der Karte (Position, Radius, Auslöser: im Editor die Karte öffnen → Klang wählen → Inspektor).</p></div>`;
  }

  #ablageHtml(e) {
    const text = e.art === 'musikOrdner' ? 'Musik-Titel hierher ziehen oder' : e.art === 'musik' ? 'Neue Fassung dieses Titels hierher ziehen oder' : 'Eigene Datei hierher ziehen oder';
    return `<div class="az-ablage" tabindex="0">${text} <button type="button" data-a="hochladen">📂 Datei wählen</button><br><small class="leise">mp3 · ogg · wav · m4a · flac – danach kürzen, Fades, Lautstärke, Loop → „Übernehmen“</small></div>`;
  }

  #bindeDetail(e) {
    const d = this.elDetail;
    const knopf = (a, f) => d.querySelectorAll(`[data-a=${a}]`).forEach((b) => b.addEventListener('click', () => f(Number(b.dataset.i))));
    knopf('zurueck', () => this.el.classList.remove('detail-offen'));
    knopf('anhoeren', () => (this.laeuft === e.id ? this.stoppe() : this.spiele(e.id)));
    const datei = (pfad) => (this.laeuft === `datei:${pfad}` ? this.stoppe() : this.#spieleDatei(pfad, e, `datei:${pfad}`));
    knopf('datei', (i) => datei(e.dateien[i]));
    knopf('hochladen', () => this.elDatei.click());
    knopf('bearbeiten', () => this.bearbeiteVorhandene(e));
    knopf('original', () => this.original(e));
    knopf('einstellungen', () => this.speichereEinstellungen(e));
    knopf('titelSpielen', (i) => datei(`client/musik/${e.ordner}/${e.titel[i]}`));
    knopf('hoch', (i) => this.#verschiebeTitel(e, Number.isNaN(i) ? e.position : i, -1));
    knopf('runter', (i) => this.#verschiebeTitel(e, Number.isNaN(i) ? e.position : i, 1));
    knopf('titelWeg', (i) => this.#titelEntfernen(e, Number.isNaN(i) ? e.position : i));
    knopf('ordner', () => this.waehle(`musikOrdner:${e.ordner}`));
    for (const r of d.querySelectorAll('.az-regler input')) r.addEventListener('input', () => (r.nextElementSibling.textContent = `${r.value} %`));
    d.querySelector('[data-f=reihe]')?.addEventListener('change', (ev) => this.#setzeReihe(e, ev.target.checked));
    const ablage = d.querySelector('.az-ablage');
    if (ablage) {
      ablage.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ablage.classList.add('ziel');
      });
      ablage.addEventListener('dragleave', () => ablage.classList.remove('ziel'));
      ablage.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ablage.classList.remove('ziel');
        const datei = ev.dataTransfer?.files?.[0];
        if (datei) this.ladeUpload(datei);
      });
    }
  }

  // --- Abspielen -----------------------------------------------------------------------------------------------------

  #kontext() {
    if (!this.ctx) this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    this.ctx.resume?.();
    return this.ctx;
  }

  #puffer(pfad) {
    if (!this.puffer.has(pfad)) {
      const p = fetch(url(pfad), { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`${pfad} fehlt (${r.status})`);
          return r.arrayBuffer();
        })
        .then((b) => this.#kontext().decodeAudioData(b));
      p.catch(() => this.puffer.delete(pfad));
      this.puffer.set(pfad, p);
    }
    return this.puffer.get(pfad);
  }

  /** Was klingt gerade? → alle Knöpfe passend umschalten (▶ Anhören ⇄ ⏸ Stoppen, leuchtend solange es läuft) */
  #marke(m) {
    this.laeuft = m;
    if (!this.el.isConnected) return;
    for (const b of this.el.querySelectorAll('[data-a=spiele]')) {
      const an = !!m && b.closest('[data-id]')?.dataset.id === m;
      b.textContent = an ? '⏸' : '▶';
      b.classList.toggle('laeuft', an);
      b.title = an ? 'Stoppen (Leertaste)' : 'Anhören (Leertaste)';
    }
    for (const b of this.el.querySelectorAll('[data-a=anhoeren]')) {
      const an = !!m && m === this.gewaehlt;
      b.textContent = an ? '⏸ Stoppen' : b.dataset.text;
      b.classList.toggle('laeuft', an);
    }
    for (const b of this.el.querySelectorAll('[data-marke]')) {
      const an = !!m && b.dataset.marke === m;
      b.textContent = an ? '⏸' : '▶';
      b.classList.toggle('laeuft', an);
    }
    for (const [a, aus, an] of [['vor', '▶ Vorhören', '⏸ Stoppen'], ['vorSchleife', '🔁 In Schleife', '⏸ Stoppen']]) {
      const b = this.el.querySelector(`.az-werkbank [data-a=${a}]`);
      if (!b) continue;
      b.textContent = m === a ? an : aus;
      b.classList.toggle('laeuft', m === a);
    }
  }

  /** AudioBuffer abspielen (eine Stimme), optional Schleife; `marke` = was die Knöpfe als „läuft“ zeigen */
  #spielePuffer(puffer, { pegel = 1, rate = 1, loop = false, marke = null } = {}) {
    this.stoppe();
    const ctx = this.#kontext();
    const q = ctx.createBufferSource();
    q.buffer = puffer;
    q.loop = loop;
    q.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = Math.min(3, pegel) * 0.8;
    q.connect(g).connect(ctx.destination);
    q.start(ctx.currentTime + 0.02);
    const stimme = { q, g };
    q.onended = () => {
      if (this.stimme !== stimme) return;
      this.stimme = null;
      this.#marke(null);
    };
    this.stimme = stimme;
    this.#marke(marke);
  }

  async #spieleDatei(pfad, e = null, marke = e?.id ?? null) {
    try {
      const puffer = await this.#puffer(pfad);
      const s = e?.streuung ?? 0;
      this.#spielePuffer(puffer, { pegel: e?.pegel ?? 1, rate: 1 + (Math.random() * 2 - 1) * s, loop: !!e?.loop, marke });
    } catch (fehler) {
      this.zustand.meldung(`Abspielen nicht möglich: ${fehler.message}`, 'fehler');
    }
  }

  /** Eintrag anhören: Datei (zufällige Variante) oder Synthese wie im Spiel */
  spiele(id) {
    const e = this.eintrag(id);
    if (!e) return;
    if (e.art === 'musikOrdner') return e.titel.length && this.#spieleDatei(`client/musik/${e.ordner}/${e.titel[0]}`, e);
    if (e.dateien.length) return this.#spieleDatei(e.dateien[Math.floor(Math.random() * e.dateien.length)], e);
    if (e.quelle !== 'synth') return this.zustand.meldung('Hier gibt es (noch) keinen Ton – eigene Datei hochladen', 'fehler');
    this.stoppe();
    if (!this.synth) this.synth = new Sound({ nurSynth: true });
    const s = this.synth;
    s.entsperren();
    const n = e.ereignis;
    const pegel = e.pegel;
    if (n === 'wind') s.starteAtmosphaere();
    else if (n === 'regen') s.regen(1);
    else if (n === 'nacht') s.nacht(1);
    else if (n === 'motor') {
      let t = 0;
      const lauf = setInterval(() => s.motor(Math.abs(Math.sin((t += 0.1) / 2)) * 340), 100);
      this.synthStopp = () => clearInterval(lauf);
    } else {
      s.spiele(n, { lautstaerke: pegel, tonhoehe: 1 + (Math.random() * 2 - 1) * e.streuung });
      this.#marke(e.id);
      this.synthTimer = setTimeout(() => this.stoppe(), 1500); // Kurzgeräusch: nach ~1,5 s wieder ▶ (Rezept-Länge unbekannt)
      return;
    }
    this.#marke(e.id);
    this.synthTimer = setTimeout(() => this.stoppe(), 7000);
  }

  stoppe() {
    const st = this.stimme;
    this.stimme = null;
    if (st) {
      try {
        st.g.gain.setTargetAtTime(0.0001, st.q.context.currentTime, 0.03);
        st.q.stop(st.q.context.currentTime + 0.12);
      } catch {
        /* schon zu Ende */
      }
    }
    if (this.synthTimer || this.synthStopp) {
      clearTimeout(this.synthTimer);
      this.synthTimer = null;
      this.synthStopp?.();
      this.synthStopp = null;
      this.synth?.stoppeAtmosphaere();
      this.synth?.motor(null);
    }
    this.#marke(null);
  }

  // --- Hochladen & Bearbeiten ------------------------------------------------------------------------------------------

  async ladeUpload(datei) {
    const e = this.eintrag();
    if (!e) return this.zustand.meldung('Erst links einen Eintrag wählen (oder die Datei auf eine Zeile ziehen)', 'fehler');
    const endung = audioFormat(datei.name, datei.type);
    if (!endung) return this.zustand.meldung('Nur Audio: mp3, ogg, wav, m4a, flac', 'fehler');
    if (datei.size > UPLOAD_MAX_MB * 1024 * 1024) return this.zustand.meldung(`Datei zu groß (max. ${UPLOAD_MAX_MB} MB)`, 'fehler');
    const bytes = new Uint8Array(await datei.arrayBuffer());
    if (!istAudio(bytes)) return this.zustand.meldung('Datei-Signatur passt nicht – keine Audio-Datei', 'fehler');
    let puffer;
    try {
      puffer = await this.#kontext().decodeAudioData(bytes.slice().buffer); // Probe-Dekodierung
    } catch (f) {
      return this.zustand.meldung(`Der Browser kann die Datei nicht abspielen (${f?.message ?? 'Dekodieren fehlgeschlagen'})`, 'fehler');
    }
    this.#starteBearbeitung({ puffer, bytes, endung, name: datei.name, neu: true });
  }

  async bearbeiteVorhandene(e) {
    const pfad = e.art === 'musikOrdner' ? null : e.dateien[0];
    if (!pfad) return;
    try {
      const [puffer, bytes] = await Promise.all([this.#puffer(pfad), fetch(url(pfad), { cache: 'no-store' }).then((r) => r.arrayBuffer())]);
      this.#starteBearbeitung({ puffer, bytes: new Uint8Array(bytes), endung: pfad.split('.').at(-1).toLowerCase(), name: pfad.split('/').at(-1), neu: false });
    } catch (f) {
      this.zustand.meldung(`Datei lässt sich nicht laden: ${f.message}`, 'fehler');
    }
  }

  #starteBearbeitung({ puffer, bytes, endung, name, neu }) {
    const e = this.eintrag();
    const kanaele = Array.from({ length: puffer.numberOfChannels }, (_, i) => puffer.getChannelData(i));
    this.bearbeitung = {
      quelle: { kanaele, rate: puffer.sampleRate, dauer: puffer.duration },
      bytes,
      endung,
      name,
      neu,
      werte: { ...STANDARD_BEARBEITUNG, loop: !!e?.loop },
      zurueck: [],
      vor: [],
      titelName: saubererName(name),
    };
    this.stoppe();
    this.#zeichneDetail();
  }

  /** Wert ändern (1 Undo-Schritt; beim Ziehen erst am Ende) */
  setze(werte, { merken = true } = {}) {
    const b = this.bearbeitung;
    if (!b) return;
    if (merken) {
      b.zurueck.push(b.werte);
      if (b.zurueck.length > 100) b.zurueck.shift();
      b.vor = [];
    }
    b.werte = pruefeBearbeitung({ ...b.werte, ...werte }, b.quelle.dauer);
    this.#aktualisiereWerkbank();
  }

  rueckgaengig() {
    const b = this.bearbeitung;
    if (!b?.zurueck.length) return;
    b.vor.push(b.werte);
    b.werte = b.zurueck.pop();
    this.#aktualisiereWerkbank(true);
  }

  wiederholen() {
    const b = this.bearbeitung;
    if (!b?.vor.length) return;
    b.zurueck.push(b.werte);
    b.werte = b.vor.pop();
    this.#aktualisiereWerkbank(true);
  }

  #ergebnis() {
    const b = this.bearbeitung;
    return bearbeite(b.quelle, b.werte);
  }

  #alsPuffer({ kanaele, rate }) {
    const ctx = this.#kontext();
    const p = ctx.createBuffer(kanaele.length, kanaele[0].length, rate);
    kanaele.forEach((k, i) => p.copyToChannel(k, i));
    return p;
  }

  vorhoeren(schleife = false) {
    if (!this.bearbeitung) return;
    this.#spielePuffer(this.#alsPuffer(this.#ergebnis()), { pegel: this.eintrag()?.pegel ?? 1, loop: schleife, marke: schleife ? 'vorSchleife' : 'vor' });
  }

  #zeichneWerkbank() {
    const b = this.bearbeitung;
    const e = this.eintrag();
    const w = b.werte;
    const ziele =
      e.art === 'ereignis'
        ? `<button type="button" data-a="ersatz" class="akzent">✔ Als Ersatz übernehmen</button><button type="button" data-a="variante" title="Zusätzliche Variante – das Spiel wählt zufällig">➕ Als Variante</button>`
        : e.art === 'musikOrdner'
          ? `<label>Titel-Name <input type="text" data-f="titelName" value="${esc(b.titelName)}" maxlength="60"></label><button type="button" data-a="titel" class="akzent">✔ Als Titel hinzufügen</button>`
          : `<button type="button" data-a="ersatz" class="akzent">✔ Ersetzen</button>`;
    this.elDetail.querySelector('.az-werkbank').innerHTML = `
      <h4>✂ Bearbeiten: <span class="leise">${esc(b.name)} · ${dauerText(b.quelle.dauer)} · ${b.quelle.kanaele.length > 1 ? 'Stereo' : 'Mono'}</span></h4>
      <div class="az-welle"><canvas></canvas><span class="az-zeit"></span></div>
      <div class="az-felder">
        <label>Start <input type="number" step="0.01" min="0" data-f="start"> s</label>
        <label>Ende <input type="number" step="0.01" min="0" data-f="ende"> s</label>
        <label>Einblenden <input type="number" step="0.05" min="0" data-f="fadeIn"> s</label>
        <label>Ausblenden <input type="number" step="0.05" min="0" data-f="fadeOut"> s</label>
        <label class="az-regler">Lautstärke <input type="range" min="-24" max="12" step="0.5" data-f="gainDb"> <output></output></label>
        <label class="haken"><input type="checkbox" data-f="normalisieren"> Normalisieren (lauteste Stelle −1 dB)</label>
        <label class="haken"><input type="checkbox" data-f="loop"> 🔁 Loop (nahtlose Schleife)</label>
        <label class="az-ueberblend">Loop-Übergang <input type="number" step="10" min="0" max="3000" data-f="ueberblendung"> ms</label>
      </div>
      <div class="knopfreihe">
        <button type="button" data-a="vor" class="akzent">▶ Vorhören</button><button type="button" data-a="vorSchleife">🔁 In Schleife</button>
        <button type="button" data-a="undo" title="Rückgängig (Strg+Z)">↶</button><button type="button" data-a="redo" title="Wiederholen (Strg+Y)">↷</button>
        <button type="button" data-a="zuruecksetzen" title="Alle Änderungen zurück">⟲ Zurücksetzen</button>
      </div>
      <p class="az-ergebnis leise"></p>
      <div class="knopfreihe az-ziele">${ziele}<button type="button" data-a="abbrechen">Abbrechen</button></div>`;
    const wb = this.elDetail.querySelector('.az-werkbank');
    const k = (a, f) => wb.querySelector(`[data-a=${a}]`)?.addEventListener('click', f);
    k('vor', () => (this.laeuft === 'vor' ? this.stoppe() : this.vorhoeren(false)));
    k('vorSchleife', () => (this.laeuft === 'vorSchleife' ? this.stoppe() : this.vorhoeren(true)));
    k('undo', () => this.rueckgaengig());
    k('redo', () => this.wiederholen());
    k('zuruecksetzen', () => this.setze({ ...STANDARD_BEARBEITUNG, loop: w.loop }));
    k('abbrechen', () => {
      this.bearbeitung = null;
      this.stoppe();
      this.#zeichneDetail();
    });
    k('ersatz', () => this.uebernehmen({ ersetzen: true }));
    k('variante', () => this.uebernehmen({ ersetzen: false }));
    k('titel', () => this.uebernehmen({ ersetzen: false }));
    wb.querySelector('[data-f=titelName]')?.addEventListener('input', (ev) => (b.titelName = ev.target.value));
    for (const f of wb.querySelectorAll('.az-felder [data-f]')) {
      f.addEventListener('keydown', (ev) => ev.stopPropagation());
      const lies = () => {
        const name = f.dataset.f;
        let v = f.type === 'checkbox' ? f.checked : Number(String(f.value).replace(',', '.'));
        if (name === 'ueberblendung') v /= 1000;
        return { [name]: v };
      };
      if (f.type === 'range') {
        let start = null;
        f.addEventListener('pointerdown', () => (start = this.bearbeitung.werte));
        f.addEventListener('input', () => this.setze(lies(), { merken: false }));
        f.addEventListener('change', () => {
          if (start) {
            this.bearbeitung.zurueck.push(start);
            this.bearbeitung.vor = [];
          }
          start = null;
        });
      } else f.addEventListener('change', () => this.setze(lies()));
    }
    this.#bindeWelle(wb.querySelector('.az-welle canvas'));
    this.#aktualisiereWerkbank(true);
  }

  #aktualisiereWerkbank(felder = false) {
    const b = this.bearbeitung;
    const wb = this.elDetail.querySelector('.az-werkbank');
    if (!b || !wb) return;
    const w = b.werte;
    const zahl = (x) => String(Math.round(x * 1000) / 1000);
    if (felder || true) {
      const set = (n, v) => {
        const f = wb.querySelector(`[data-f=${n}]`);
        if (f && document.activeElement !== f) f.type === 'checkbox' ? (f.checked = v) : (f.value = v);
      };
      set('start', zahl(w.start));
      set('ende', zahl(w.ende || b.quelle.dauer));
      set('fadeIn', zahl(w.fadeIn));
      set('fadeOut', zahl(w.fadeOut));
      set('gainDb', w.gainDb);
      set('normalisieren', w.normalisieren);
      set('loop', w.loop);
      set('ueberblendung', Math.round(w.ueberblendung * 1000));
    }
    wb.querySelector('.az-regler output').textContent = `${w.gainDb > 0 ? '+' : ''}${String(w.gainDb).replace('.', ',')} dB`;
    wb.querySelector('.az-ueberblend').hidden = !w.loop;
    for (const n of ['fadeIn', 'fadeOut']) wb.querySelector(`[data-f=${n}]`).disabled = w.loop;
    wb.querySelector('[data-a=undo]').disabled = !b.zurueck.length;
    wb.querySelector('[data-a=redo]').disabled = !b.vor.length;
    const dauer = ergebnisDauer(w, b.quelle.dauer);
    const unveraendert = istUnveraendert(w, b.quelle.dauer) && KOMPAKT.has(b.endung);
    const kanaele = Math.min(2, b.quelle.kanaele.length);
    const musik = this.eintrag()?.gruppe === 'musik';
    const schaetzung = unveraendert ? b.bytes.length : (dauer * bitrateFuer({ kanaele, dauer, musik })) / 8 + 2000;
    const hinweis = groessenHinweis(schaetzung, { musik });
    wb.querySelector('.az-ergebnis').innerHTML = `Ergebnis: <b>${dauerText(dauer)}</b> · ca. <b>${groesseText(schaetzung)}</b> ${unveraendert ? `(Original .${esc(b.endung)}, unverändert)` : '(Ogg/Opus)'}${w.loop ? ' · Schleife nahtlos' : ''}${hinweis ? `<br><span class="warnung">⚠ ${esc(hinweis)}</span>` : ''}`;
    this.#zeichneWelle();
  }

  /** Wellenform + Griffe: Start/Ende ziehen (Doppelklick setzt zurück), Fades als Rampen */
  #bindeWelle(canvas) {
    this.welle = canvas;
    let griff = null;
    let start = null;
    const zeitBei = (ev) => {
      const r = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * this.bearbeitung.quelle.dauer;
    };
    canvas.addEventListener('pointerdown', (ev) => {
      const b = this.bearbeitung;
      const t = zeitBei(ev);
      const w = b.werte;
      const ende = w.ende || b.quelle.dauer;
      griff = Math.abs(t - w.start) <= Math.abs(t - ende) ? 'start' : 'ende';
      start = w;
      canvas.setPointerCapture(ev.pointerId);
      this.setze({ [griff]: t }, { merken: false });
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!griff) {
        const r = canvas.getBoundingClientRect();
        this.elDetail.querySelector('.az-zeit').textContent = dauerText(((ev.clientX - r.left) / r.width) * this.bearbeitung.quelle.dauer);
        return;
      }
      this.setze({ [griff]: zeitBei(ev) }, { merken: false });
    });
    const los = () => {
      if (!griff) return;
      griff = null;
      this.bearbeitung.zurueck.push(start);
      this.bearbeitung.vor = [];
      this.#aktualisiereWerkbank();
    };
    canvas.addEventListener('pointerup', los);
    canvas.addEventListener('pointercancel', los);
    canvas.addEventListener('dblclick', () => this.setze({ start: 0, ende: 0 }));
    new ResizeObserver(() => this.#zeichneWelle()).observe(canvas);
  }

  #zeichneWelle() {
    const c = this.welle;
    const b = this.bearbeitung;
    if (!c?.isConnected || !b) return;
    const dpr = devicePixelRatio || 1;
    const breite = Math.max(50, Math.round(c.clientWidth * dpr));
    const hoehe = Math.max(40, Math.round(c.clientHeight * dpr));
    if (c.width !== breite) c.width = breite;
    if (c.height !== hoehe) c.height = hoehe;
    if (!b.welle || b.welle.length !== breite * 2) b.welle = wellenformMinMax(b.quelle.kanaele[0], breite);
    const g = c.getContext('2d');
    g.clearRect(0, 0, breite, hoehe);
    const w = b.werte;
    const d = b.quelle.dauer;
    const x0 = (w.start / d) * breite;
    const x1 = ((w.ende || d) / d) * breite;
    g.fillStyle = '#10141a';
    g.fillRect(0, 0, breite, hoehe);
    g.fillStyle = '#1b2a1d';
    g.fillRect(x0, 0, x1 - x0, hoehe);
    const m = hoehe / 2;
    for (let x = 0; x < breite; x++) {
      const drin = x >= x0 && x <= x1;
      g.fillStyle = drin ? '#6fcf73' : '#3a4250';
      const lo = b.welle[x * 2];
      const hi = b.welle[x * 2 + 1];
      g.fillRect(x, m - hi * m * 0.95, 1, Math.max(1, (hi - lo) * m * 0.95));
    }
    // Fades als Linien
    g.strokeStyle = '#f5b83d';
    g.lineWidth = 2 * dpr;
    if (!w.loop && w.fadeIn > 0) {
      g.beginPath();
      g.moveTo(x0, hoehe);
      g.lineTo(x0 + (w.fadeIn / d) * breite, 2);
      g.stroke();
    }
    if (!w.loop && w.fadeOut > 0) {
      g.beginPath();
      g.moveTo(x1 - (w.fadeOut / d) * breite, 2);
      g.lineTo(x1, hoehe);
      g.stroke();
    }
    if (w.loop && w.ueberblendung > 0) {
      g.fillStyle = 'rgba(43,140,255,0.25)';
      g.fillRect(x1 - (w.ueberblendung / d) * breite, 0, (w.ueberblendung / d) * breite, hoehe);
    }
    g.fillStyle = '#2b8cff';
    for (const x of [x0, x1]) g.fillRect(Math.round(x) - dpr, 0, 2 * dpr, hoehe);
    for (const x of [x0, x1]) g.fillRect(Math.round(x) - 6 * dpr, 0, 12 * dpr, 10 * dpr);
  }

  // --- Speichern -----------------------------------------------------------------------------------------------------

  /** Ergebnis-Datei bauen: unverändert + kompakt → Original-Bytes, sonst bearbeiten + kodieren */
  async #datei() {
    const b = this.bearbeitung;
    if (istUnveraendert(b.werte, b.quelle.dauer) && KOMPAKT.has(b.endung)) return { bytes: b.bytes, endung: b.endung, hinweis: '' };
    const erg = this.#ergebnis();
    if (erg.geklippt > erg.kanaele[0].length * 0.001) this.zustand.meldung(`Achtung: ${erg.geklippt} Samples übersteuert – Lautstärke etwas senken`, 'fehler');
    return kodiere(erg, { bitrate: bitrateFuer({ kanaele: Math.min(2, erg.kanaele.length), dauer: erg.kanaele[0].length / erg.rate, musik: this.eintrag()?.gruppe === 'musik' }) });
  }

  async uebernehmen({ ersetzen }) {
    const e = this.eintrag();
    const b = this.bearbeitung;
    if (!e || !b) return;
    const knoepfe = this.elDetail.querySelectorAll('.az-ziele button');
    knoepfe.forEach((k) => (k.disabled = true));
    try {
      const { bytes, endung, hinweis } = await this.#datei();
      const ziel = zielPfad(e, { endung, ersetzen, name: b.titelName });
      if (ziel.fehler) throw new Error(ziel.fehler);
      if (!istVerbunden()) {
        await this.#ohneServer(bytes, ziel.pfad);
        return;
      }
      await schreibeDatei(ziel.pfad, bytes);
      for (const p of ziel.loeschen) await loescheDatei(p);
      if (e.art === 'musikOrdner' || e.art === 'musik') {
        const ordner = e.ordner;
        const titel = this.eintrag(`musikOrdner:${ordner}`).titel;
        const neuName = ziel.pfad.split('/').at(-1);
        const reihe = e.art === 'musik' ? titel.map((t) => (t === e.datei ? neuName : t)) : [...titel, neuName];
        await schreibeDatei('client/musik/einstellungen.json', setzeMusikEinstellung(this.daten.musikEinstellungen, ordner, { reihenfolge: reihe }));
      }
      this.puffer.delete(ziel.pfad);
      this.info.delete(ziel.pfad);
      this.bearbeitung = null;
      this.zustand.meldung(`✓ Gespeichert: ${ziel.pfad} (${groesseText(bytes.length)}) – im Spiel nach Neuladen aktiv. Danach committen.`, 'ok');
      if (hinweis || groessenHinweis(bytes.length, { musik: e.gruppe === 'musik' })) this.zustand.meldung(`⚠ ${hinweis || groessenHinweis(bytes.length, { musik: e.gruppe === 'musik' })}`, 'fehler');
      this.letzteSpeicherung = { pfad: ziel.pfad, groesse: bytes.length, endung };
      const neueId = e.art === 'musikOrdner' ? `musik:${e.ordner}/${ziel.pfad.split('/').at(-1)}` : e.art === 'musik' ? `musik:${e.ordner}/${ziel.pfad.split('/').at(-1)}` : e.id;
      this.gewaehlt = neueId;
      await this.neuLaden();
    } catch (f) {
      this.zustand.meldung(`Speichern fehlgeschlagen: ${f.message}`, 'fehler');
    } finally {
      knoepfe.forEach((k) => k.isConnected && (k.disabled = false));
    }
  }

  /** Ohne lokalen Server: Hinweis + fertige Datei zum Herunterladen anbieten */
  async #ohneServer(bytes, pfad) {
    const name = pfad.split('/').at(-1);
    const ok = await dialog({
      titel: '🌐 Speichern geht nur lokal',
      html: `<p>${esc(LOKAL_HINWEIS)}</p><p class="leise">Alternativ: fertige Datei herunterladen und selbst nach <code>${esc(pfad)}</code> legen, dann <code>npm run sounds</code> bzw. <code>npm run musik:index</code>.</p>`,
      knoepfe: [{ text: 'Schließen', wert: false }, { text: `⬇ ${name} (${groesseText(bytes.length)})`, wert: true, art: 'akzent' }],
    });
    if (!ok) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes]));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async #nurLokal() {
    if (istVerbunden()) return true;
    await dialog({ titel: '🌐 Speichern geht nur lokal', html: `<p>${esc(LOKAL_HINWEIS)}</p>` });
    return false;
  }

  async speichereEinstellungen(e) {
    const pegel = Number(this.elDetail.querySelector('[data-f=pegel]').value) / 100;
    const streuung = Number(this.elDetail.querySelector('[data-f=streuung]')?.value ?? 0) / 100;
    if (!(await this.#nurLokal())) return;
    try {
      await schreibeDatei('client/audio/eigene/einstellungen.json', setzeSoundEinstellung(this.daten.einstellungen, e.ereignis, { lautstaerke: pegel, streuung }));
      this.zustand.meldung(`✓ ${e.name}: Pegel ${prozent(pegel)}${streuung ? `, Streuung ±${Math.round(streuung * 100)} %` : ''} gespeichert`, 'ok');
      await this.neuLaden();
    } catch (f) {
      this.zustand.meldung(`Speichern fehlgeschlagen: ${f.message}`, 'fehler');
    }
  }

  async original(e) {
    if (!(await this.#nurLokal())) return;
    const was = [...e.eigeneDateien.map((p) => `<li><code>${esc(p)}</code></li>`), ...(this.daten.einstellungen?.[e.ereignis] ? ['<li>Pegel/Streuung aus einstellungen.json</li>'] : [])];
    if (!(await bestaetigen('↺ Original wiederherstellen?', `Entfernt:<ul>${was.join('')}</ul>Danach spielt wieder ${e.sampleDateien.length ? 'das mitgelieferte Sample' : 'die Synthese'}.`))) return;
    try {
      for (const p of e.eigeneDateien) await loescheDatei(p);
      if (this.daten.einstellungen?.[e.ereignis]) await schreibeDatei('client/audio/eigene/einstellungen.json', setzeSoundEinstellung(this.daten.einstellungen, e.ereignis, null));
      e.eigeneDateien.forEach((p) => this.puffer.delete(p));
      this.zustand.meldung(`↺ ${e.name}: Original wiederhergestellt`, 'ok');
      await this.neuLaden();
    } catch (f) {
      this.zustand.meldung(`Fehlgeschlagen: ${f.message}`, 'fehler');
    }
  }

  async #setzeReihe(e, reihe) {
    if (!(await this.#nurLokal())) return this.#zeichneDetail();
    await schreibeDatei('client/musik/einstellungen.json', setzeMusikEinstellung(this.daten.musikEinstellungen, e.ordner, { zufall: !reihe, reihenfolge: e.titel }));
    await this.neuLaden();
  }

  async #verschiebeTitel(e, i, richtung) {
    if (!(await this.#nurLokal())) return;
    const ordner = this.eintrag(`musikOrdner:${e.ordner}`);
    const reihe = verschiebe(ordner.titel, i, richtung);
    await schreibeDatei('client/musik/einstellungen.json', setzeMusikEinstellung(this.daten.musikEinstellungen, e.ordner, { reihenfolge: reihe }));
    await this.neuLaden();
  }

  async #titelEntfernen(e, i) {
    if (!(await this.#nurLokal())) return;
    const ordner = this.eintrag(`musikOrdner:${e.ordner}`);
    const datei = ordner.titel[i];
    if (!(await bestaetigen('🗑 Titel entfernen?', `<code>client/musik/${esc(e.ordner)}/${esc(datei)}</code> wird gelöscht.`))) return;
    await loescheDatei(`client/musik/${e.ordner}/${datei}`);
    await schreibeDatei('client/musik/einstellungen.json', setzeMusikEinstellung(this.daten.musikEinstellungen, e.ordner, { reihenfolge: ordner.titel.filter((t) => t !== datei) }));
    if (e.art === 'musik') this.gewaehlt = ordner.id;
    await this.neuLaden();
  }
}

export { kannOpus };
