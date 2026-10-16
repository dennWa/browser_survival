import { HOTBAR_PLAETZE } from '../../gemeinsam/konstanten.js';
import { WerkbankMenue } from './werkbankMenue.js';
import { EntwicklerFenster } from './entwicklerFenster.js';
import { InventarFenster } from './inventarFenster.js';
import { SkillFenster } from './skillFenster.js';

/**
 * HUD (Head-Up-Display) über dem Spiel:
 *   Statuszeile, Balken (Leben/Hunger/Durst), Schnellleiste (Inventar 1–8), Munition,
 *   Aufheben-Knopf, Nachladen-Knopf (Touch), Taschenlampen-Knopf, Meldungen,
 *   Todesbildschirm (mit "Sofort wiederbeleben"), Admin-Menü (nur Admins), Debug (F3).
 *
 * Bedienung Schnellleiste: Klick/Tippen = benutzen bzw. ausrüsten · Rechtsklick/lange drücken = ablegen.
 */
const AKTUALISIERUNG_MS = 250;
const MELDUNG_DAUER_MS = 2600;
const MAX_MELDUNGEN = 4;
const LANGES_DRUECKEN_MS = 500;
const ICON_GROESSE = 48;
const CHAT_ZEILEN = 8;
const CHAT_SICHTBAR_MS = 15000;

export class Hud {
  #aktionen = {};
  #assets = null;
  #istTouch = false;
  #slots = [];
  #letztesLevel = null;
  #letzterHinweis = null;
  #letzterTuerHinweis = null;
  #letzteUhr = '';
  #letzteArbeit = '';
  #letzteAusdauer = -1;
  #letztErschoepft = false;
  #istAdmin = false;
  #nachtsicht = false;
  #schalterStand = '';

  constructor(dokument, { debug = false } = {}) {
    this.dokument = dokument;
    const el = (id) => dokument.getElementById(id);
    this.el = {
      hud: el('hud'),
      status: el('hud-status'),
      debug: el('hud-debug'),
      hilfe: el('hud-hilfe'),
      abmelden: el('hud-abmelden'),
      vollbild: el('hud-vollbild'),
      ton: el('hud-ton'),
      leben: el('wert-leben'),
      level: el('wert-level'),
      levelZahl: el('level-zahl'),
      levelXp: el('level-xp'),
      schlafblende: el('schlafblende'),
      hunger: el('wert-hunger'),
      durst: el('wert-durst'),
      ausdauer: el('wert-ausdauer'),
      hotbar: el('hotbar'),
      munition: el('hud-munition'),
      aufheben: el('knopf-aufheben'),
      tuer: el('knopf-tuer'),
      uhr: el('hud-uhr'),
      nachladen: el('knopf-nachladen'),
      meldungen: el('hud-meldungen'),
      tod: el('tod-overlay'),
      todText: el('tod-countdown'),
      wiederbeleben: el('tod-wiederbeleben'),
      arbeit: el('hud-arbeit'),
      arbeitText: el('hud-arbeit-text'),
      licht: el('hud-licht'),
      karte: el('hud-karte'),
      chatKnopf: el('hud-chat'),
      chat: el('chat'),
      chatLog: el('chat-log'),
      chatForm: el('chat-form'),
      chatEingabe: el('chat-eingabe'),
      spielerliste: el('spielerliste'),
      admin: el('hud-admin'),
      adminPanel: el('admin-panel'),
    };
    this.debug = debug;
    this.letzteAktualisierung = 0;

    this.el.vollbild.addEventListener('click', () => {
      if (dokument.fullscreenElement) dokument.exitFullscreen?.();
      else dokument.documentElement.requestFullscreen?.().catch(() => {});
    });
    this.el.aufheben.addEventListener('click', () => this.#aktionen.interagieren?.());
    this.werkbank = new WerkbankMenue(dokument, { zeichneIcon: (canvas, defId) => this.zeichneIcon(canvas, defId) });
    this.werkbank.beiHerstellen((rezept) => this.#aktionen.herstellen?.(rezept));
    this.werkbank.beiSchliessen(() => this.#aktionen.werkbankSchliessen?.());
    this.el.tuer.addEventListener('click', () => this.#aktionen.tuer?.());
    this.el.nachladen.addEventListener('click', () => this.#aktionen.nachladen?.());
    this.el.wiederbeleben.addEventListener('click', () => this.#aktionen.wiederbeleben?.());
    this.el.licht.addEventListener('click', () => this.#aktionen.licht?.());
    this.el.karte.addEventListener('click', () => this.#aktionen.karte?.());
    this.el.chatKnopf.addEventListener('click', () => this.chatOeffnen());
    this.el.status.addEventListener('click', () => this.#aktionen.spielerliste?.()); // Touch: Statuszeile antippen
    this.el.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.el.chatEingabe.value.trim();
      if (text) this.#aktionen.chat?.(text);
      this.chatSchliessen();
    });
    this.el.chatEingabe.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.chatSchliessen();
    });
    this.el.chatEingabe.addEventListener('blur', () => setTimeout(() => this.chatSchliessen(), 0));
    this.el.admin.addEventListener('click', () => this.adminMenuUmschalten());
    for (const knopf of this.el.adminPanel.querySelectorAll('button[data-befehl]')) {
      knopf.addEventListener('click', () => this.#aktionen.admin?.(knopf.dataset.befehl));
    }
    this.el.adminPanel.querySelector('[data-nachtsicht]').addEventListener('click', () => this.#aktionen.nachtsicht?.());
    this.entwickler = new EntwicklerFenster(dokument);
    this.entwickler.beiAktionen({
      abfragen: () => this.#aktionen.entwicklerAbfragen?.(),
      setzen: (werte) => this.#aktionen.entwicklerSetzen?.(werte),
      zuruecksetzen: () => this.#aktionen.entwicklerZuruecksetzen?.(),
    });
    this.el.adminPanel.querySelector('[data-entwickler]').addEventListener('click', () => this.entwickler.zeige());
    this.inventar = new InventarFenster(dokument, { zeichneIcon: (canvas, defId) => this.zeichneIcon(canvas, defId) });
    this.inventar.beiAktionen({
      benutzen: (slot) => this.#aktionen.benutzen?.(slot),
      tauschen: (von, nach) => this.#aktionen.tauschen?.(von, nach),
      ablegen: (slot) => this.#aktionen.ablegen?.(slot),
      rucksackAblegen: () => this.#aktionen.rucksackAblegen?.(),
      herstellen: (rezept) => this.#aktionen.herstellen?.(rezept),
    });
    el('hud-inventar').addEventListener('click', () => this.inventar.zeige());
    this.skills = new SkillFenster(dokument);
    this.skills.beiSkill((name) => this.#aktionen.skill?.(name));
    el('hud-skills').addEventListener('click', () => this.skills.zeige());
    el('wert-level').addEventListener('click', () => this.skills.zeige());
    el('hud-zoom').addEventListener('click', () => this.#aktionen.zoomStufe?.());
    el('platzieren-ok').addEventListener('click', () => this.#aktionen.platzierenOk?.());
    el('platzieren-weg').addEventListener('click', () => this.#aktionen.platzierenAbbrechen?.());
    this.#baueHotbar();
  }

  setzeAssets(assets) {
    this.#assets = assets;
  }

  beiAbmelden(fn) {
    this.el.abmelden.addEventListener('click', fn);
  }

  beiTon(fn) {
    this.el.ton.addEventListener('click', fn);
  }

  zeigeTon(stumm) {
    this.el.ton.textContent = stumm ? '🔇' : '🔊';
  }

  /** @param aktionen { benutzen(slot), ablegen(slot), aufheben(), nachladen(), tuer(), licht(), wiederbeleben(), admin(befehl), nachtsicht() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  /** @param istTouch true → Touch-Hinweise, Vollbild- und Nachladen-Knopf */
  anzeigen(istTouch = false) {
    this.#istTouch = istTouch;
    this.el.hud.hidden = false;
    this.el.hud.classList.toggle('touch', istTouch);
    this.el.debug.hidden = !this.debug;
    this.el.vollbild.hidden = !istTouch || !document.fullscreenEnabled;
    this.el.hilfe.textContent = istTouch
      ? 'Links: laufen · Rechts: zielen, ganz drücken = Angriff'
      : 'WASD laufen · Maus zielen · Klick/Leertaste Angriff · E benutzen · F Tür · R nachladen · L Lampe · I Inventar · U Fähigkeiten · Q fallen lassen · K Karte · T Chat · Tab Spieler · 1–8 Schnellleiste';
    this.#letzterHinweis = null;
    this.#letzterTuerHinweis = null;
    this.#letzteUhr = '';
    this.#letztesLevel = null;
  }

  verbergen() {
    this.el.schlafblende.classList.remove('an');
    this.el.hud.hidden = true;
    this.el.tod.hidden = true;
    this.el.adminPanel.hidden = true;
    this.el.tuer.hidden = true;
    this.el.arbeit.hidden = true;
    this.zeigePlatzierung(null);
    this.werkbank.zeige(null);
    this.entwickler.zeige(false);
    this.inventar.zeige(false);
    this.skills.zeige(false);
    this.chatSchliessen();
    this.el.chatLog.replaceChildren();
    this.el.spielerliste.hidden = true;
    this.#istAdmin = false;
    this.#nachtsicht = false;
    this.#schalterStand = '';
    this.el.meldungen.replaceChildren();
  }

  /** Admin-Menü auf/zu (nur wenn der Server Admin-Recht gemeldet hat). */
  adminMenuUmschalten() {
    if (!this.#istAdmin) return;
    this.el.adminPanel.hidden = !this.el.adminPanel.hidden;
    this.el.admin.classList.toggle('aktiv', !this.el.adminPanel.hidden);
  }

  /** Nachtsicht = Dunkelheit im Renderer aus (rein optisch, nur Admin-Menü). */
  setzeNachtsicht(an) {
    this.#nachtsicht = an;
    this.#schalterStand = '';
  }

  debugUmschalten() {
    this.debug = !this.debug;
    this.el.debug.hidden = !this.debug;
  }

  /** Platzier-Leiste zeigen (name) bzw. verstecken (null). */
  zeigePlatzierung(name) {
    const leiste = this.dokument.getElementById('hud-platzieren');
    leiste.hidden = !name;
    if (name) {
      this.dokument.getElementById('hud-platzieren-text').textContent = `🔨 ${name}`;
      this.dokument.getElementById('hud-platzieren-hilfe').hidden = this.#istTouch;
    }
  }

  meldung(text) {
    const div = Object.assign(this.dokument.createElement('div'), { className: 'meldung', textContent: text });
    this.el.meldungen.append(div);
    while (this.el.meldungen.children.length > MAX_MELDUNGEN) this.el.meldungen.firstElementChild.remove();
    setTimeout(() => div.remove(), MELDUNG_DAUER_MS);
  }

  /** Ausdauer kommt aus der Vorhersage (jeden Frame) – DOM nur bei spürbarer Änderung anfassen. */
  setzeAusdauer(anteil, erschoepft) {
    const gerundet = Math.round((anteil || 0) * 50) / 50;
    if (gerundet === this.#letzteAusdauer && erschoepft === this.#letztErschoepft) return;
    this.#letzteAusdauer = gerundet;
    this.#letztErschoepft = erschoepft;
    setzeBalken(this.el.ausdauer, gerundet);
    this.el.ausdauer.classList.toggle('erschoepft', !!erschoepft);
  }

  /** Private Spielerdaten vom Server (bei jeder Änderung). */
  setzeSpielerDaten(daten, itemDefinitionen) {
    setzeBalken(this.el.leben, daten.leben / daten.maxLeben);
    this.#zeigeLevel(daten);
    setzeBalken(this.el.hunger, daten.hunger / 100);
    setzeBalken(this.el.durst, daten.durst / 100);

    for (let slot = 0; slot < HOTBAR_PLAETZE; slot++) {
      this.#zeichneSlot(this.#slots[slot], daten.inventar[slot], itemDefinitionen, slot === daten.ausgeruestet);
    }
    this.inventar.setzeDaten(daten, itemDefinitionen);
    this.skills.setzeDaten(daten);
    this.dokument.getElementById('hud-skills').classList.toggle('hinweis', (daten.skillPunkte ?? 0) > 0);
    this.el.level.classList.toggle('punkte-frei', (daten.skillPunkte ?? 0) > 0);

    // Munitionsanzeige für ausgerüstete Schusswaffe
    const waffe = daten.ausgeruestet !== null ? daten.inventar[daten.ausgeruestet] : null;
    const def = waffe && itemDefinitionen[waffe.defId];
    const schusswaffe = def?.kategorie === 'fernkampf';
    this.el.munition.hidden = !schusswaffe;
    this.el.nachladen.hidden = !schusswaffe || !this.#istTouch;
    if (schusswaffe) {
      const reserve = daten.inventar.reduce((s, e) => s + (e?.defId === def.munition ? e.menge : 0), 0);
      this.el.munition.textContent = daten.nachladen ? 'Nachladen …' : `${waffe.magazin} / ${reserve}`;
      this.el.munition.classList.toggle('leer', waffe.magazin === 0);
    }

    this.el.tod.hidden = !daten.tot;
    if (daten.tot) this.el.todText.textContent = `Automatische Wiederbelebung in ${Math.max(0, daten.respawnIn)} s`;

    this.#istAdmin = !!daten.admin;
    this.el.admin.hidden = !this.#istAdmin;
    if (!this.#istAdmin) this.el.adminPanel.hidden = true;
  }

  /** Schalter-Zustände (Taschenlampe, Gottmodus …) aus dem öffentlichen Spielerzustand – DOM nur bei Änderung. */
  #zeigeSchalter(spieler) {
    const stand = `${spieler.lichtAn !== false}|${!!spieler.gottmodus}|${!!spieler.unsichtbar}|${this.#nachtsicht}`;
    if (stand === this.#schalterStand) return;
    this.#schalterStand = stand;
    const lichtAn = spieler.lichtAn !== false;
    this.el.licht.classList.toggle('aus', !lichtAn);
    this.el.licht.title = `Taschenlampe ${lichtAn ? 'an' : 'aus'} (L) – aus = Zombies sehen dich schlechter`;
    const an = { gottmodus: !!spieler.gottmodus, unsichtbar: !!spieler.unsichtbar };
    for (const knopf of this.el.adminPanel.querySelectorAll('button[data-befehl]')) {
      if (knopf.dataset.befehl in an) knopf.classList.toggle('an', an[knopf.dataset.befehl]);
    }
    this.el.adminPanel.querySelector('[data-nachtsicht]').classList.toggle('an', this.#nachtsicht);
  }

  /** Jeden Frame aufgerufen – teure DOM-Updates gedrosselt. */
  aktualisiere(d) {
    if (d.spieler) this.#zeigeSchalter(d.spieler);
    const tuerHinweis = d.fAktion ? `${this.#istTouch ? d.fAktion.symbol : '[F]'} ${d.fAktion.text}` : null;
    if (tuerHinweis !== this.#letzterTuerHinweis) {
      this.#letzterTuerHinweis = tuerHinweis;
      this.el.tuer.hidden = !tuerHinweis;
      if (tuerHinweis) this.el.tuer.textContent = tuerHinweis;
    }
    if (d.uhr) {
      const uhr = `${d.uhr.istNacht ? '🌙' : '☀'} Tag ${d.uhr.tag} · ${d.uhr.uhrzeit}`;
      if (uhr !== this.#letzteUhr) {
        this.#letzteUhr = uhr;
        this.el.uhr.textContent = uhr;
        this.el.uhr.classList.toggle('nacht', d.uhr.istNacht);
      }
    }
    const i = d.interaktion;
    const hinweis = i ? `${this.#istTouch ? (i.symbol ?? '✋') : '[E]'} ${i.text}` : null;
    if (hinweis !== this.#letzterHinweis) {
      this.#letzterHinweis = hinweis;
      this.el.aufheben.hidden = !hinweis;
      if (hinweis) this.el.aufheben.textContent = hinweis;
    }

    this.#zeigeArbeit(d.arbeit);

    const jetzt = performance.now();
    if (jetzt - this.letzteAktualisierung < AKTUALISIERUNG_MS) return;
    this.letzteAktualisierung = jetzt;
    this.el.status.textContent = `${d.serverName} · ${d.spielerOnline} online · Ping ${d.ping ?? '–'} ms`;
    if (this.debug) {
      const s = d.spieler;
      this.el.debug.textContent = [
        `FPS ${d.fps}   Tick ${d.tick}`,
        `Verbindung: ${d.verbindung}`,
        `Position: ${Math.round(s.x)} | ${Math.round(s.y)}`,
        `Unbestätigte Eingaben: ${d.offeneEingaben}`,
        `Zombies: ${d.zombies}   Gegenstände: ${d.gegenstaende}`,
        d.grafik ?? '',
      ].join('\n');
    }
  }

  // ---------------------------------------------------------------------------

  #baueHotbar() {
    for (let slot = 0; slot < HOTBAR_PLAETZE; slot++) {
      const knopf = Object.assign(this.dokument.createElement('button'), { type: 'button', className: 'slot' });
      knopf.dataset.slot = slot; // Ablageziel beim Ziehen aus dem Inventar-Fenster
      const icon = Object.assign(this.dokument.createElement('canvas'), { className: 'slot-icon', width: ICON_GROESSE * 2, height: ICON_GROESSE * 2 });
      const nummer = Object.assign(this.dokument.createElement('span'), { className: 'slot-nummer', textContent: String(slot + 1) });
      const menge = Object.assign(this.dokument.createElement('span'), { className: 'slot-menge' });
      knopf.append(icon, nummer, menge);
      this.el.hotbar.append(knopf);
      this.#slots.push({ knopf, icon, menge, defId: null });

      let timer = null;
      let langGedrueckt = false;
      knopf.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        langGedrueckt = false;
        timer = setTimeout(() => {
          langGedrueckt = true;
          this.#aktionen.ablegen?.(slot);
        }, LANGES_DRUECKEN_MS);
      });
      const abbrechen = () => clearTimeout(timer);
      knopf.addEventListener('pointerup', abbrechen);
      knopf.addEventListener('pointerleave', abbrechen);
      knopf.addEventListener('click', () => {
        if (langGedrueckt) {
          langGedrueckt = false;
          return;
        }
        this.#aktionen.benutzen?.(slot);
      });
      knopf.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.pointerType !== 'touch') this.#aktionen.ablegen?.(slot);
      });
    }
  }

  /** Chatzeile anzeigen: { von, text, admin, system } – verblasst nach CHAT_SICHTBAR_MS */
  chatNachricht(n) {
    const zeile = Object.assign(this.dokument.createElement('div'), { className: `chat-zeile${n.system ? ' system' : ''}${n.admin ? ' admin' : ''}` });
    if (n.system) zeile.textContent = n.text;
    else zeile.append(Object.assign(this.dokument.createElement('b'), { textContent: `${n.von}: ` }), n.text);
    this.el.chatLog.append(zeile);
    while (this.el.chatLog.children.length > CHAT_ZEILEN) this.el.chatLog.firstElementChild.remove();
    setTimeout(() => zeile.classList.add('alt'), CHAT_SICHTBAR_MS);
  }

  chatOeffnen() {
    this.el.chatForm.hidden = false;
    this.el.chat.classList.add('offen');
    this.el.chatEingabe.focus();
  }

  chatSchliessen() {
    if (this.el.chatForm.hidden) return;
    this.el.chatEingabe.value = '';
    this.el.chatForm.hidden = true;
    this.el.chat.classList.remove('offen');
    this.el.chatEingabe.blur();
  }

  /** Wer ist online? (Tab) */
  spielerlisteUmschalten(namen) {
    const el = this.el.spielerliste;
    el.hidden = !el.hidden;
    if (el.hidden) return;
    el.replaceChildren(
      Object.assign(this.dokument.createElement('h3'), { textContent: `${namen.length} online` }),
      ...namen.map((name) => Object.assign(this.dokument.createElement('div'), { textContent: name })),
    );
  }

  /** Werkbank-Menü zeigen (rezepte = null → schließen). */
  zeigeWerkbank(rezepte, spielerDaten, itemDefinitionen) {
    this.werkbank.zeige(rezepte, spielerDaten, itemDefinitionen);
  }

  /** Level-Plakette + XP-Balken; beim Aufstieg pulsiert die Plakette kurz. */
  #zeigeLevel(daten) {
    if (!Number.isInteger(daten.level)) return;
    const el = this.el;
    if (this.#letztesLevel !== null && daten.level > this.#letztesLevel) {
      el.level.classList.remove('aufgestiegen');
      void el.level.offsetWidth; // Animation neu starten
      el.level.classList.add('aufgestiegen');
    }
    this.#letztesLevel = daten.level;
    el.levelZahl.textContent = daten.level;
    // nicht setzeBalken(): wenig XP ist kein "kritischer" Wert, soll also nicht blinken
    el.level.querySelector('.fuellung').style.width = `${Math.min(100, (daten.xp / Math.max(1, daten.xpNaechstes)) * 100)}%`;
    el.levelXp.textContent = `${daten.xp}/${daten.xpNaechstes}`;
    el.level.title = `Level ${daten.level} – ${daten.xp} von ${daten.xpNaechstes} XP bis Level ${daten.level + 1} (10 XP pro Zombie, beim Tod ist alles weg)`;
  }

  /** Fortschrittsbalken für Abbauen/Schlafen. */
  #zeigeArbeit(arbeit) {
    this.el.schlafblende.classList.toggle('an', arbeit?.art === 'schlafen');
    const schluessel = arbeit ? `${arbeit.art}${arbeit.fortschritt}${arbeit.wartet}` : '';
    if (schluessel === this.#letzteArbeit) return;
    this.#letzteArbeit = schluessel;
    this.el.arbeit.hidden = !arbeit;
    if (!arbeit) return;
    const text = arbeit.wartet
      ? '💤 Warte, bis alle schlafen … (bewegen = aufstehen)'
      : ({ holz: '🪓 Baum fällen …', stein: '⛏ Stein abbauen …', eisenerz: '⛏ Eisenerz abbauen …', kochen: '🍳 Braten …', schlafen: '💤 Schlafen … (bewegen = aufwachen)' }[arbeit.art] ?? '…');
    this.el.arbeitText.textContent = text;
    this.el.arbeit.querySelector('.fuellung').style.width = `${Math.round(arbeit.fortschritt * 100)}%`;
  }

  /** Item-Icon aus dem Atlas zentriert in ein Canvas malen (Schnellleiste, Werkbank). */
  zeichneIcon(canvas, defId) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rahmen = defId && this.#assets?.item(defId);
    const bild = this.#assets?.itemBild;
    if (!rahmen || !bild) return false;
    const faktor = (canvas.width * 0.82) / Math.max(rahmen.b, rahmen.h);
    const b = rahmen.b * faktor;
    const h = rahmen.h * faktor;
    ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, (canvas.width - b) / 2, (canvas.height - h) / 2, b, h);
    return true;
  }

  #zeichneSlot(slot, eintrag, itemDefinitionen, ausgeruestet) {
    slot.knopf.classList.toggle('ausgeruestet', ausgeruestet);
    slot.knopf.classList.toggle('leer', !eintrag);
    slot.knopf.title = eintrag ? itemDefinitionen[eintrag.defId]?.name ?? eintrag.defId : '';
    slot.menge.textContent = eintrag && eintrag.menge > 1 ? String(eintrag.menge) : eintrag?.magazin !== undefined ? `${eintrag.magazin}` : '';
    if (slot.defId === (eintrag?.defId ?? null)) return; // Icon unverändert
    slot.defId = eintrag?.defId ?? null;

    if (this.zeichneIcon(slot.icon, eintrag?.defId) || !eintrag) return;
    const ctx = slot.icon.getContext('2d');
    ctx.fillStyle = '#9aa0a8';
    ctx.font = '600 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(slot.knopf.title.slice(0, 2), slot.icon.width / 2, slot.icon.height / 2 + 8);
  }
}

function setzeBalken(element, anteil) {
  const wert = Math.max(0, Math.min(1, anteil || 0));
  element.querySelector('.fuellung').style.width = `${wert * 100}%`;
  element.classList.toggle('kritisch', wert < 0.2);
}
