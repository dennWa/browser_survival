import { AUSSEHEN, pruefeAussehen } from '../../gemeinsam/spieler/aussehen.js';

/**
 * Login-Bildschirm: Serverauswahl, Benutzername, Passwort.
 * Registrierung gibt es bewusst nicht – Accounts legt der Server-Admin an (npm run konto).
 * Zuletzt gewählter Server + Name werden im Browser gemerkt (localStorage, optional).
 */
const SPEICHER_SCHLUESSEL = 'browserSurvival.login';
const GAST_SCHLUESSEL = 'browserSurvival.gastName';
const AUSSEHEN_SCHLUESSEL = 'browserSurvival.aussehen';

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

export class LoginBildschirm {
  #beiAnmeldung = null;

  constructor(dokument, serverListe) {
    this.serverListe = serverListe;
    this.el = {
      overlay: dokument.getElementById('login'),
      formular: dokument.getElementById('login-formular'),
      server: dokument.getElementById('login-server'),
      adresseFeld: dokument.getElementById('login-adresse-feld'),
      adresse: dokument.getElementById('login-adresse'),
      name: dokument.getElementById('login-name'),
      passwortFeld: dokument.getElementById('login-passwort-feld'),
      passwort: dokument.getElementById('login-passwort'),
      knopf: dokument.getElementById('login-knopf'),
      gast: dokument.getElementById('login-gast'),
      gastName: dokument.getElementById('login-gast-name'),
      aussehen: dokument.getElementById('login-aussehen'),
      meldung: dokument.getElementById('login-meldung'),
    };

    for (const eintrag of serverListe) this.el.server.add(new Option(eintrag.name, eintrag.id));
    this.#baueAussehenWahl(dokument);
    this.#ladeGespeichertes();
    this.#feldSichtbarkeit();

    this.el.server.addEventListener('change', () => this.#feldSichtbarkeit());
    this.el.formular.addEventListener('submit', (e) => {
      e.preventDefault();
      const daten = this.#werte();
      this.#speichern(daten);
      this.#beiAnmeldung?.(daten);
    });
    this.el.gast.addEventListener('click', () => {
      const daten = { ...this.#werte(), benutzername: gastName(), passwort: '', gast: true };
      this.#speichern({ ...daten, benutzername: this.el.name.value.trim() });
      this.#beiAnmeldung?.(daten);
    });
  }

  /** fn({ server, adresse, benutzername, passwort, gast? }) */
  beiAnmeldung(fn) {
    this.#beiAnmeldung = fn;
  }

  anzeigen(meldung = '') {
    this.el.overlay.hidden = false;
    this.el.passwort.value = '';
    this.zeigeMeldung(meldung, true);
    this.setzeBeschaeftigt(false);
    this.el.name.focus();
  }

  verbergen() {
    this.el.overlay.hidden = true;
  }

  setzeBeschaeftigt(beschaeftigt) {
    this.el.knopf.disabled = beschaeftigt;
    this.el.gast.disabled = beschaeftigt;
    this.el.knopf.textContent = beschaeftigt ? 'Verbinde …' : 'Login';
    if (beschaeftigt) this.zeigeMeldung('');
  }

  zeigeMeldung(text, istFehler = false) {
    this.el.meldung.textContent = text;
    this.el.meldung.classList.toggle('fehler', istFehler);
  }

  #aktuellerServer() {
    return this.serverListe.find((s) => s.id === this.el.server.value) ?? this.serverListe[0];
  }

  /** Auswahlknöpfe je aktivem Aussehen-Merkmal (z. B. Figur: Mann/Frau); Wahl wird im Browser gemerkt. */
  #baueAussehenWahl(dokument) {
    let gespeichert = null;
    try {
      gespeichert = JSON.parse(localStorage.getItem(AUSSEHEN_SCHLUESSEL) ?? 'null');
    } catch {
      // egal
    }
    this.aussehen = pruefeAussehen(gespeichert);
    for (const [merkmal, def] of Object.entries(AUSSEHEN)) {
      if (!def.aktiv) continue;
      const zeile = Object.assign(dokument.createElement('div'), { className: 'aussehen-zeile' });
      zeile.append(Object.assign(dokument.createElement('span'), { textContent: def.name }));
      for (const [wert, option] of Object.entries(def.optionen)) {
        const knopf = Object.assign(dokument.createElement('button'), {
          type: 'button',
          textContent: `${option.symbol ?? ''} ${option.name}`.trim(),
          className: this.aussehen[merkmal] === wert ? 'aktiv' : '',
        });
        knopf.addEventListener('click', () => {
          this.aussehen[merkmal] = wert;
          for (const k of zeile.querySelectorAll('button')) k.classList.toggle('aktiv', k === knopf);
          try {
            localStorage.setItem(AUSSEHEN_SCHLUESSEL, JSON.stringify(this.aussehen));
          } catch {
            // egal
          }
        });
        zeile.append(knopf);
      }
      this.el.aussehen.append(zeile);
    }
  }

  #werte() {
    return {
      aussehen: { ...this.aussehen },
      server: this.#aktuellerServer(),
      adresse: this.el.adresse.value.trim(),
      benutzername: this.el.name.value.trim(),
      passwort: this.el.passwort.value,
    };
  }

  #feldSichtbarkeit() {
    const server = this.#aktuellerServer();
    this.el.adresseFeld.hidden = !(server.typ === 'websocket' && !server.adresse);
    this.el.passwortFeld.hidden = server.typ === 'lokal';
    this.el.gast.hidden = server.typ === 'lokal'; // lokal ist ohnehin alles "Gast"
    this.el.gastName.textContent = `(${gastName()})`;
  }

  #ladeGespeichertes() {
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) ?? '{}');
      if (this.serverListe.some((s) => s.id === gespeichert.serverId)) this.el.server.value = gespeichert.serverId;
      if (gespeichert.benutzername) this.el.name.value = gespeichert.benutzername;
      if (gespeichert.adresse) this.el.adresse.value = gespeichert.adresse;
    } catch {
      // Speicher nicht verfügbar (privates Fenster o. Ä.) → egal
    }
  }

  #speichern({ server, adresse, benutzername }) {
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({ serverId: server.id, adresse, benutzername }));
    } catch {
      // ignorieren
    }
  }
}
