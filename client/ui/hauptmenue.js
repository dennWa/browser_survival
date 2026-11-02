import { SLOT_ANZAHL, ladeSlots, slotMeta, ladeMpCharakter, loescheSlot, datumText } from '../netzwerk/spielstandSlots.js';

/**
 * Runde 28: Hauptmenü (ersetzt den alten Login-Bildschirm).
 *
 *   Start ─┬─ Singleplayer → 3 Spielstand-Slots (Laden | Neu erstellen → Charaktererstellung → Laden = Spiel startet)
 *          ├─ Multiplayer  → Serverauswahl → Charakter dieses Servers (Anmeldung Konto/Gast; Beitreten | Neu erstellen)
 *          ├─ Developer (Ecke oben rechts) → Passwortabfrage (noch ohne Prüfung) → Map-Editor
 *          └─ Tutorial, Credits (Fußzeile)
 *
 * Startet nichts selbst: `beiStart(daten)` bekommt alles, was main.js#anmeldungStarten braucht
 *   { server, adresse?, benutzername, passwort?, gast?, aussehen?, charakterName?, neuerCharakter?, slot?, mpSchluessel? }.
 * Spielstände: client/netzwerk/spielstandSlots.js. Charaktererstellung: ui/charakterErstellung.js.
 */
const GAST_SCHLUESSEL = 'browserSurvival.gastName';
const MP_LOGIN = 'browserSurvival.mpLogin'; // { serverId: { art, name, adresse } }
const AUSSEHEN_SCHLUESSEL = 'browserSurvival.aussehen'; // zuletzt erstellte Figur (Tutorial)

/** Zufälliger Gastname, z. B. "Gast-4821" – wird im Browser gemerkt (gleicher Gast = gleicher Spielstand). */
export function gastName(neu = false) {
  let name = null;
  try {
    name = neu ? null : localStorage.getItem(GAST_SCHLUESSEL);
  } catch {
    // egal
  }
  if (!name || !/^Gast-\d{4,6}$/.test(name)) {
    name = `Gast-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      localStorage.setItem(GAST_SCHLUESSEL, name);
    } catch {
      // egal
    }
  }
  return name;
}

const lies = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null');
  } catch {
    return null;
  }
};
const schreib = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // egal
  }
};

export class Hauptmenue {
  #beiStart = null;
  #beiTutorial = null;
  #seite = 'start';
  #mpServer = null; // gewählter Servereintrag
  #mpArt = 'konto';
  #fotos = new Map();

  /**
   * @param serverListe   SERVER_LISTE (client/konfiguration.js)
   * @param erstellung    CharakterErstellung
   * @param fotografiere  (aussehen) → Data-URL | null (Standbild der Figur)
   */
  constructor(dokument, { serverListe, erstellung, fotografiere }) {
    this.d = dokument;
    this.serverListe = serverListe;
    this.erstellung = erstellung;
    this.fotografiere = fotografiere;
    const $ = (id) => dokument.getElementById(id);
    this.el = {
      overlay: $('hauptmenue'),
      slots: $('hm-slots'),
      server: $('hm-server'),
      mpTitel: $('hm-mp-titel'),
      mpAdresse: $('hm-mp-adresse'),
      mpAdresseFeld: $('hm-mp-adresse-feld'),
      mpAdresseEingabe: $('hm-mp-adresse-eingabe'),
      mpName: $('hm-mp-name'),
      mpPasswort: $('hm-mp-passwort'),
      mpGastname: $('hm-mp-gastname'),
      mpCharakter: $('hm-mp-charakter'),
      mpLogin: $('hm-mp-login'),
      meldung: $('hm-meldung'),
      tutorial: $('hm-tutorial'),
      devDialog: $('hm-dev-dialog'),
      devWahl: $('hm-dev-wahl'),
      devPasswort: $('hm-dev-passwort'),
      frage: $('hm-frage'),
    };
    $('hm-singleplayer').addEventListener('click', () => this.zeigeSeite('sp'));
    $('hm-multiplayer').addEventListener('click', () => this.zeigeSeite('mp'));
    this.el.tutorial.addEventListener('click', () => this.#beiTutorial?.({ aussehen: lies(AUSSEHEN_SCHLUESSEL) }));
    for (const k of this.el.overlay.querySelectorAll('[data-zurueck]')) k.addEventListener('click', () => this.zeigeSeite(k.dataset.zurueck));
    // Developer: Passwortabfrage (Prüfung folgt später) → Werkzeug-Auswahl
    $('hm-dev').addEventListener('click', () => {
      this.el.devPasswort.value = '';
      this.el.devDialog.showModal();
      this.el.devPasswort.focus();
    });
    this.el.devDialog.addEventListener('close', () => {
      if (this.el.devDialog.returnValue === 'ok') this.el.devWahl.showModal();
    });
    // Multiplayer-Anmeldung: Konto | Gast
    for (const k of this.el.mpLogin.querySelectorAll('.hm-umschalter button')) k.addEventListener('click', () => this.#setzeMpArt(k.dataset.art));
    this.el.mpLogin.addEventListener('submit', (e) => e.preventDefault());
    for (const feld of [this.el.mpName, this.el.mpAdresseEingabe]) feld.addEventListener('change', () => this.#merkeMpLogin());
    this.el.mpAdresseEingabe.addEventListener('input', () => this.#zeigeMpCharakter());
    // Android-Zurück / Esc: eine Ebene zurück
    dokument.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.el.overlay.hidden || dokument.querySelector('dialog[open]')) return;
      const zurueck = { sp: 'start', mp: 'start', mpCharakter: 'mp' }[this.#seite];
      if (zurueck) this.zeigeSeite(zurueck);
    });
    this.#baueServerListe();
  }

  /** fn(daten) – Spiel starten (siehe Kopfkommentar) */
  beiStart(fn) {
    this.#beiStart = fn;
  }

  /** fn({ aussehen }) – Tutorial starten */
  beiTutorial(fn) {
    this.#beiTutorial = fn;
  }

  /** Tutorial-Link hervorheben (Erstbesuch: noch nie geschafft) */
  empfehleTutorial(an) {
    this.el.tutorial.classList.toggle('empfohlen', an);
  }

  /** Nach dem Tutorial „Story starten“ → zur Spielstand-Auswahl */
  starteStory() {
    this.zeigeSeite('sp');
  }

  get offen() {
    return !this.el.overlay.hidden;
  }

  anzeigen(meldung = '') {
    this.el.overlay.hidden = false;
    this.setzeBeschaeftigt(false);
    if (this.#seite === 'erstellung') this.#seite = 'start';
    this.zeigeSeite(this.#seite);
    this.zeigeMeldung(meldung, true);
  }

  verbergen() {
    this.erstellung.schliessen();
    this.el.overlay.hidden = true;
  }

  setzeBeschaeftigt(beschaeftigt) {
    this.el.overlay.classList.toggle('beschaeftigt', beschaeftigt);
    for (const k of this.el.overlay.querySelectorAll('.hm-seite button')) k.disabled = beschaeftigt;
    if (beschaeftigt) this.zeigeMeldung('Verbinde …');
  }

  zeigeMeldung(text, istFehler = false) {
    this.el.meldung.textContent = text;
    this.el.meldung.classList.toggle('fehler', istFehler && !!text);
  }

  zeigeSeite(seite) {
    if (this.#seite === 'erstellung' && seite !== 'erstellung') this.erstellung.schliessen();
    this.#seite = seite;
    for (const s of this.el.overlay.querySelectorAll('.hm-seite')) s.hidden = s.dataset.seite !== seite;
    this.el.overlay.dataset.seite = seite;
    this.zeigeMeldung('');
    if (seite === 'sp') this.#zeigeSlots();
    if (seite === 'mpCharakter') this.#zeigeMpCharakter();
  }

  // ------------------------------------------------------------- Singleplayer

  #zeigeSlots() {
    const d = this.d;
    const slots = ladeSlots();
    this.el.slots.replaceChildren(
      ...slots.map((meta, i) => {
        const nr = i + 1;
        const karte = Object.assign(d.createElement('article'), { className: `hm-slot${meta ? '' : ' leer'}` });
        const bild = Object.assign(d.createElement('div'), { className: 'hm-slot-bild' });
        const info = Object.assign(d.createElement('div'), { className: 'hm-slot-info' });
        info.append(Object.assign(d.createElement('span'), { className: 'hm-slot-nr', textContent: `Spielstand ${nr}` }));
        const knoepfe = Object.assign(d.createElement('div'), { className: 'hm-slot-knoepfe' });
        if (meta) {
          this.#bildFuer(bild, meta.aussehen);
          info.append(
            Object.assign(d.createElement('h3'), { textContent: meta.name }),
            this.#daten([
              ['Erstellt', datumText(meta.erstellt)],
              ['Zuletzt gespielt', datumText(meta.zuletzt)],
            ]),
          );
          knoepfe.append(
            this.#knopf('Laden', 'hm-primaer', () => this.#starte({ slot: nr, benutzername: meta.name, aussehen: null })),
            this.#knopf('Neu erstellen', '', async () => {
              if (await this.frage(`Spielstand ${nr} überschreiben?`, `„${meta.name}“ wird durch einen neuen Charakter ersetzt, sobald du ihn mit „Laden“ bestätigst.`, 'Neu erstellen'))
                this.#erstelleSlot(nr, meta);
            }),
            this.#knopf('Löschen', 'hm-leise', async () => {
              if (!(await this.frage(`Spielstand ${nr} löschen?`, `„${meta.name}“ und die Welt dieses Spielstands werden endgültig gelöscht.`, 'Löschen'))) return;
              loescheSlot(nr);
              this.#zeigeSlots();
            }),
          );
        } else {
          bild.classList.add('hm-bild-leer');
          info.append(Object.assign(d.createElement('h3'), { textContent: 'Leerer Spielstand' }), Object.assign(d.createElement('p'), { className: 'hm-klein', textContent: 'Erstelle einen Charakter und starte ein neues Spiel.' }));
          knoepfe.append(this.#knopf('Charakter erstellen', 'hm-primaer', () => this.#erstelleSlot(nr, null)));
        }
        karte.append(bild, info, knoepfe);
        return karte;
      }),
    );
  }

  #erstelleSlot(nr, alt) {
    this.zeigeSeite('erstellung');
    this.erstellung.oeffne({
      titel: `Spielstand ${nr}`,
      aussehen: alt?.aussehen ?? lies(AUSSEHEN_SCHLUESSEL),
      name: '',
      beiAbbruch: () => this.zeigeSeite('sp'),
      beiFertig: ({ aussehen, name }) => {
        schreib(AUSSEHEN_SCHLUESSEL, aussehen);
        this.#starte({ slot: nr, benutzername: name, aussehen, neuerSlot: true });
      },
    });
  }

  #starte({ slot, benutzername, aussehen, neuerSlot = false }) {
    const server = this.serverListe.find((s) => s.typ === 'lokal');
    this.#seite = 'sp'; // nach dem Spiel (oder einem Fehler) zurück zur Spielstand-Auswahl
    this.#beiStart?.({ server, slot, benutzername, aussehen, neuerSlot, gast: false, passwort: '' });
  }

  // -------------------------------------------------------------- Multiplayer

  #baueServerListe() {
    const d = this.d;
    const liste = this.serverListe.filter((s) => s.typ === 'websocket');
    this.el.server.replaceChildren(
      ...liste.map((s) => {
        const k = Object.assign(d.createElement('button'), { type: 'button', className: 'hm-karte hm-server' });
        const titel = Object.assign(d.createElement('span'), { className: 'hm-server-name', textContent: s.name.replace(/\s*\(.*\)\s*$/, '').replace(/ …$/, '') });
        const adresse = Object.assign(d.createElement('span'), { className: 'hm-server-adresse', textContent: s.adresse ?? 'Adresse selbst eingeben' });
        const pfeil = Object.assign(d.createElement('span'), { className: 'hm-pfeil', textContent: '›' });
        k.append(titel, adresse, pfeil);
        k.addEventListener('click', () => {
          this.#mpServer = s;
          this.zeigeSeite('mpCharakter');
        });
        return k;
      }),
    );
    if (!liste.length) this.el.server.append(Object.assign(d.createElement('p'), { className: 'hm-klein', textContent: 'Kein Server eingetragen.' }));
  }

  /** Speicher-Schlüssel des Multiplayer-Charakters: Server-ID bzw. bei eigener Adresse die Adresse */
  #mpSchluessel() {
    const s = this.#mpServer;
    if (!s) return null;
    return s.adresse ? s.id : `eigene:${this.el.mpAdresseEingabe.value.trim()}`;
  }

  #setzeMpArt(art) {
    this.#mpArt = art === 'gast' ? 'gast' : 'konto';
    for (const k of this.el.mpLogin.querySelectorAll('.hm-umschalter button')) k.classList.toggle('aktiv', k.dataset.art === this.#mpArt);
    this.el.mpLogin.querySelector('.hm-konto-felder').hidden = this.#mpArt !== 'konto';
    this.el.mpLogin.querySelector('.hm-gast-info').hidden = this.#mpArt !== 'gast';
    this.el.mpGastname.textContent = gastName();
    this.#merkeMpLogin();
    this.#zeigeMpCharakter();
  }

  #merkeMpLogin() {
    const s = this.#mpServer;
    if (!s) return;
    const alle = lies(MP_LOGIN) ?? {};
    alle[s.id] = { art: this.#mpArt, name: this.el.mpName.value.trim(), adresse: this.el.mpAdresseEingabe.value.trim() };
    schreib(MP_LOGIN, alle);
  }

  #zeigeMpCharakter() {
    const s = this.#mpServer;
    if (!s) return this.zeigeSeite('mp');
    const d = this.d;
    if (this.el.mpTitel.dataset.server !== s.id) {
      // Server neu gewählt → gemerkte Anmeldung laden
      this.el.mpTitel.dataset.server = s.id;
      const gemerkt = (lies(MP_LOGIN) ?? {})[s.id] ?? {};
      this.el.mpName.value = gemerkt.name ?? '';
      this.el.mpPasswort.value = '';
      this.el.mpAdresseEingabe.value = gemerkt.adresse ?? '';
      this.el.mpAdresseFeld.hidden = !!s.adresse;
      this.#mpArt = gemerkt.art === 'gast' ? 'gast' : 'konto';
      return this.#setzeMpArt(this.#mpArt);
    }
    this.el.mpTitel.textContent = s.name.replace(/\s*\(.*\)\s*$/, '').replace(/ …$/, '');
    this.el.mpAdresse.textContent = s.adresse ?? '';
    const meta = ladeMpCharakter(this.#mpSchluessel());
    const karte = this.el.mpCharakter;
    karte.replaceChildren(Object.assign(d.createElement('h3'), { textContent: 'Charakter' }));
    const zeile = Object.assign(d.createElement('div'), { className: 'hm-slot hm-mp-slot' + (meta ? '' : ' leer') });
    const bild = Object.assign(d.createElement('div'), { className: 'hm-slot-bild' });
    const info = Object.assign(d.createElement('div'), { className: 'hm-slot-info' });
    const knoepfe = Object.assign(d.createElement('div'), { className: 'hm-slot-knoepfe' });
    if (meta) {
      this.#bildFuer(bild, meta.aussehen);
      info.append(
        Object.assign(d.createElement('h3'), { textContent: meta.name }),
        this.#daten([
          ['Erstellt', datumText(meta.erstellt)],
          ['Zuletzt gespielt', datumText(meta.zuletzt)],
          ['Anmeldung', meta.konto ? `Konto ${meta.konto}` : meta.gast ? `Gast (${meta.gast})` : '–'],
        ]),
      );
      knoepfe.append(
        this.#knopf('Beitreten', 'hm-primaer', () => this.#mpBeitreten({ charakterName: meta.name, aussehen: null, neuerCharakter: false })),
        this.#knopf('Neuen Charakter erstellen', '', async () => {
          if (await this.frage('Neuen Charakter erstellen?', `„${meta.name}“ wird auf diesem Server durch den neuen Charakter ersetzt.`, 'Neu erstellen')) this.#mpErstellen(meta);
        }),
      );
    } else {
      bild.classList.add('hm-bild-leer');
      info.append(Object.assign(d.createElement('h3'), { textContent: 'Noch kein Charakter' }), Object.assign(d.createElement('p'), { className: 'hm-klein', textContent: 'Erstelle zuerst einen Charakter, um dem Server beizutreten.' }));
      knoepfe.append(this.#knopf('Charakter erstellen', 'hm-primaer', () => this.#mpErstellen(null)));
      if (this.#mpArt === 'konto') knoepfe.append(this.#knopf('Vorhandenen Konto-Charakter laden', '', () => this.#mpBeitreten({ charakterName: null, aussehen: null, neuerCharakter: false })));
    }
    zeile.append(bild, info, knoepfe);
    karte.append(zeile);
  }

  /** Anmeldedaten prüfen → { benutzername, passwort, gast, adresse } oder null (Meldung gezeigt) */
  #mpAnmeldung() {
    const s = this.#mpServer;
    const adresse = s.adresse ? '' : this.el.mpAdresseEingabe.value.trim();
    if (!s.adresse && !adresse) {
      this.zeigeMeldung('Bitte eine Serveradresse eingeben.', true);
      this.el.mpAdresseEingabe.focus();
      return null;
    }
    if (this.#mpArt === 'gast') return { benutzername: gastName(), passwort: '', gast: true, adresse };
    const benutzername = this.el.mpName.value.trim();
    if (!benutzername || !this.el.mpPasswort.value) {
      this.zeigeMeldung('Bitte Benutzername und Passwort eingeben – oder als Gast spielen.', true);
      (benutzername ? this.el.mpPasswort : this.el.mpName).focus();
      return null;
    }
    return { benutzername, passwort: this.el.mpPasswort.value, gast: false, adresse };
  }

  #mpErstellen(alt) {
    if (!this.#mpAnmeldung()) return;
    this.zeigeSeite('erstellung');
    this.erstellung.oeffne({
      titel: this.el.mpTitel.textContent,
      aussehen: alt?.aussehen ?? lies(AUSSEHEN_SCHLUESSEL),
      name: '',
      beiAbbruch: () => this.zeigeSeite('mpCharakter'),
      beiFertig: ({ aussehen, name }) => {
        schreib(AUSSEHEN_SCHLUESSEL, aussehen);
        this.#mpBeitreten({ charakterName: name, aussehen, neuerCharakter: true }, 'mpCharakter');
      },
    });
  }

  #mpBeitreten({ charakterName, aussehen, neuerCharakter }, zurueck = null) {
    const anmeldung = this.#mpAnmeldung();
    if (!anmeldung) {
      if (zurueck) this.zeigeSeite(zurueck);
      return;
    }
    this.#merkeMpLogin();
    if (zurueck) this.#seite = zurueck; // nach Fehler/Abmelden zurück auf die Charakterseite
    this.#beiStart?.({ server: this.#mpServer, ...anmeldung, charakterName, aussehen, neuerCharakter, mpSchluessel: this.#mpSchluessel() });
  }

  // ------------------------------------------------------------------- Helfer

  #knopf(text, klasse, beiKlick) {
    const k = Object.assign(this.d.createElement('button'), { type: 'button', className: `hm-knopf ${klasse}`.trim(), textContent: text });
    k.addEventListener('click', beiKlick);
    return k;
  }

  #daten(paare) {
    const dl = Object.assign(this.d.createElement('dl'), { className: 'hm-daten' });
    for (const [a, b] of paare) dl.append(Object.assign(this.d.createElement('dt'), { textContent: a }), Object.assign(this.d.createElement('dd'), { textContent: b }));
    return dl;
  }

  /** Standbild der Figur (gecacht je Aussehen); ohne 3D bleibt der Platzhalter */
  #bildFuer(bild, aussehen) {
    const schluessel = JSON.stringify(aussehen);
    if (!this.#fotos.has(schluessel)) {
      const url = this.fotografiere?.(aussehen);
      if (url) this.#fotos.set(schluessel, url);
    }
    const url = this.#fotos.get(schluessel);
    if (url) bild.append(Object.assign(this.d.createElement('img'), { src: url, alt: '' }));
    else bild.classList.add('hm-bild-leer');
  }

  /** Rückfrage-Dialog → Promise<boolean> */
  frage(titel, text, ja = 'Ja') {
    const dlg = this.el.frage;
    this.d.getElementById('hm-frage-titel').textContent = titel;
    this.d.getElementById('hm-frage-text').textContent = text;
    this.d.getElementById('hm-frage-ja').textContent = ja;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((ok) => dlg.addEventListener('close', () => ok(dlg.returnValue === 'ja'), { once: true }));
  }

  /** Slot-Metadaten (für main.js) */
  slotMeta(nr) {
    return slotMeta(nr);
  }

  get slotAnzahl() {
    return SLOT_ANZAHL;
  }
}
