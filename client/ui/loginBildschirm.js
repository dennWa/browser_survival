/**
 * Login-Bildschirm: Serverauswahl, Benutzername, Passwort.
 * Registrierung gibt es bewusst nicht – Accounts legt der Server-Admin an (npm run konto).
 * Zuletzt gewählter Server + Name werden im Browser gemerkt (localStorage, optional).
 */
const SPEICHER_SCHLUESSEL = 'browserSurvival.login';

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
      meldung: dokument.getElementById('login-meldung'),
    };

    for (const eintrag of serverListe) this.el.server.add(new Option(eintrag.name, eintrag.id));
    this.#ladeGespeichertes();
    this.#feldSichtbarkeit();

    this.el.server.addEventListener('change', () => this.#feldSichtbarkeit());
    this.el.formular.addEventListener('submit', (e) => {
      e.preventDefault();
      const daten = this.#werte();
      this.#speichern(daten);
      this.#beiAnmeldung?.(daten);
    });
  }

  /** fn({ server, adresse, benutzername, passwort }) */
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

  #werte() {
    return {
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
