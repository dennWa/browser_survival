import { dekodiere, kodiere } from '../../gemeinsam/protokoll.js';

/**
 * Macht aus einem Text-Kanal (WebSocket oder lokal) eine Verbindung, die Objekte sendet/empfängt.
 * Der Rest des Clients weiß nicht, welcher Transport dahinter steckt.
 */
export class JsonVerbindung {
  #kanal;
  #nachrichtHoerer = new Set();
  #trennHoerer = new Set();

  constructor(kanal, beschreibung) {
    this.#kanal = kanal;
    this.beschreibung = beschreibung; // z. B. "Lokal" oder "ws://…"
    this.getrennt = false;
    kanal.beiNachricht((text) => {
      const nachricht = dekodiere(text);
      if (nachricht) for (const hoerer of [...this.#nachrichtHoerer]) hoerer(nachricht);
    });
    kanal.beiTrennung((grund) => {
      if (this.getrennt) return;
      this.getrennt = true;
      for (const hoerer of [...this.#trennHoerer]) hoerer(grund);
    });
  }

  senden(nachricht) {
    if (!this.getrennt) this.#kanal.senden(kodiere(nachricht));
  }

  /** @returns Funktion zum Abmelden des Hörers */
  beiNachricht(hoerer) {
    this.#nachrichtHoerer.add(hoerer);
    return () => this.#nachrichtHoerer.delete(hoerer);
  }

  beiTrennung(hoerer) {
    this.#trennHoerer.add(hoerer);
    return () => this.#trennHoerer.delete(hoerer);
  }

  trennen(grund = 'Abgemeldet') {
    this.#kanal.trennen(grund);
  }
}
