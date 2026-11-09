import { einladungsLink } from '../netzwerk/p2p.js';

/**
 * Runde 47: „🏠 Einladen“ – nur für den Host eines Browser-Servers (Multiplayer → Server hosten).
 * Zeigt Einladungscode + Link (kopieren / teilen), den Zustand des Vermittlers, die Einstellungen (PvP, Spielerzahl, Passwort)
 * und alle Mitspieler mit „Kicken“ (AKTION admin 'kick' – der Server sperrt den Namen bis zum Neustart).
 * Daten: setzeWelt(welt | null), setzeStatus({ zustand, text, gaeste }) vom p2p.Host, Spielerliste per holeSpiel().spielerListe.
 */
export class HostFenster {
  #welt = null;
  #status = null;

  /** @param holeSpiel () => ClientSpiel | null · @param kicke (name) => void */
  constructor(dokument, { holeSpiel, kicke }) {
    this.d = dokument;
    this.holeSpiel = holeSpiel;
    this.kicke = kicke;
    this.el = dokument.getElementById('host-fenster');
    this.knopf = dokument.getElementById('hud-einladen');
    this.knopf.addEventListener('click', () => this.umschalten());
    dokument.getElementById('host-schliessen').addEventListener('click', () => this.zeige(false));
    dokument.getElementById('host-code-kopieren').addEventListener('click', () => this.#kopiere(this.#welt?.code, 'Code kopiert'));
    dokument.getElementById('host-link-kopieren').addEventListener('click', () => this.#kopiere(this.#link(), 'Link kopiert'));
    const teilen = dokument.getElementById('host-teilen');
    teilen.hidden = !globalThis.navigator?.share;
    teilen.addEventListener('click', () => navigator.share?.({ title: 'Browser Survival', text: `Spiel mit mir! Code: ${this.#welt?.code}`, url: this.#link() }).catch(() => {}));
    setInterval(() => this.offen && this.#zeichneSpieler(), 1000); // Spielerliste kommt ~1×/s (SPIELER_LISTE)
  }

  get offen() {
    return !this.el.hidden;
  }

  #link() {
    return this.#welt ? einladungsLink(this.#welt.code) : '';
  }

  /** Gehostete Welt (oder null = kein Hosting → Knopf weg). */
  setzeWelt(welt) {
    this.#welt = welt;
    this.knopf.hidden = !welt;
    if (!welt) {
      this.#status = null;
      this.zeige(false);
    }
  }

  setzeStatus(status) {
    this.#status = status;
    this.knopf.classList.toggle('warnung', status?.zustand === 'fehler');
    if (this.offen) this.#zeichne();
  }

  zeige(an = true) {
    this.el.hidden = !an || !this.#welt;
    if (!this.el.hidden) this.#zeichne();
  }

  umschalten() {
    this.zeige(this.el.hidden);
  }


  #kopiere(text, meldung) {
    if (!text) return;
    const fertig = () => {
      const info = this.d.getElementById('host-kopiert');
      info.textContent = `✔ ${meldung}`;
      clearTimeout(this.kopiertTimer);
      this.kopiertTimer = setTimeout(() => (info.textContent = ''), 2500);
    };
    navigator.clipboard?.writeText(text).then(fertig, () => {
      const feld = this.d.getElementById('host-link');
      feld.select();
      this.d.execCommand?.('copy');
      fertig();
    });
  }

  #zeichne() {
    const w = this.#welt;
    if (!w) return;
    const $ = (id) => this.d.getElementById(id);
    $('host-titel').textContent = `🏠 ${w.name}`;
    $('host-code').textContent = w.code;
    $('host-link').value = this.#link();
    $('host-regeln').textContent = `PvP ${w.pvp ? 'an' : 'aus'} · bis ${w.maxSpieler} Spieler${w.passwort ? ` · Passwort: ${w.passwort}` : ' · ohne Passwort'}`;
    const st = this.#status;
    const status = $('host-status');
    status.textContent = st ? `${st.zustand === 'bereit' ? '🟢' : st.zustand === 'fehler' ? '🔴' : '🟡'} ${st.text}` : '🟡 Starte …';
    status.classList.toggle('fehler', st?.zustand === 'fehler');
    this.#zeichneSpieler();
  }

  #zeichneSpieler() {
    const liste = this.d.getElementById('host-spieler');
    const spiel = this.holeSpiel();
    const ich = spiel?.benutzername?.toLowerCase();
    const spieler = (spiel?.spielerListe ?? []).filter((s) => !s.bot);
    const zeilen = spieler.map((s) => {
      const z = this.d.createElement('div');
      z.className = 'host-spieler';
      z.append(Object.assign(this.d.createElement('span'), { textContent: `${s.anzeige ?? s.name}${s.name.toLowerCase() === ich ? ' (du)' : ''} · ${s.zone ?? ''}` }));
      if (s.name.toLowerCase() !== ich) {
        const k = Object.assign(this.d.createElement('button'), { type: 'button', textContent: 'Kicken', title: 'Vom Server werfen (bis du den Server neu startest)' });
        k.addEventListener('click', () => {
          if (k.dataset.sicher) return this.kicke(s.name);
          k.dataset.sicher = '1';
          k.textContent = 'Wirklich?';
          setTimeout(() => {
            delete k.dataset.sicher;
            k.textContent = 'Kicken';
          }, 3000);
        });
        z.append(k);
      }
      return z;
    });
    if (!zeilen.length) zeilen.push(Object.assign(this.d.createElement('p'), { className: 'werkbank-hinweis', textContent: 'Noch niemand da.' }));
    liste.replaceChildren(...zeilen);
  }
}
