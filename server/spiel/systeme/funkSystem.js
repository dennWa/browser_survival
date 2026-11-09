/**
 * Runde 47: Funkgerät. Jeder Spieler hat `spieler.funk = { an, frequenz }` (Frequenz in Zehntel-MHz, 87,5–108,0 MHz,
 * Standard 100,0) – wirksam nur mit Item `funkgeraet` im Inventar und lebend. Wer auf derselben Frequenz funkt,
 * hört sich – egal wie weit weg, auch über Zonen hinweg (SpielServer.#sendeFunk baut die Partnerlisten).
 * Die Sprache selbst läuft per WebRTC zwischen den Browsern (client/audio/stimmChat.js, 2. Audiospur „Funk“);
 * der Server vermittelt nur die Signale (#stimme erlaubt Funkpartner zonenübergreifend) und meldet, wer gerade sendet.
 * AKTION `funk` { was: an|aus|frequenz|senden, wert } – auch im Auto und niedergestreckt (Hilferuf!).
 */
export const FUNK_ITEM = 'funkgeraet';
export const FREQUENZ = Object.freeze({ min: 875, max: 1080, standard: 1000 });

export function neuerFunk() {
  return { an: false, frequenz: FREQUENZ.standard };
}

/** Zehntel-MHz (875–1080) oder null. */
export function pruefeFrequenz(wert) {
  return Number.isInteger(wert) && wert >= FREQUENZ.min && wert <= FREQUENZ.max ? wert : null;
}

/** Funk-Zustand aus einem Spielstand (alles geprüft). */
export function pruefeFunk(roh) {
  return { an: roh?.an === true, frequenz: pruefeFrequenz(roh?.frequenz) ?? FREQUENZ.standard };
}

export function hatFunkgeraet(spieler) {
  return spieler.inventar.some((e) => e?.defId === FUNK_ITEM);
}

/** Ist das Funkgerät dieses Spielers gerade wirklich auf Empfang? (an + Gerät dabei + lebt + kein Bot) */
export function funkBereit(spieler) {
  return !!spieler.funk?.an && !spieler.tot && !spieler.bot && hatFunkgeraet(spieler);
}

/** Frequenz als Text: 1015 → „101,5 MHz“ */
export function frequenzText(f) {
  return `${(f / 10).toFixed(1).replace('.', ',')} MHz`;
}

export function funkAktion(spielWelt, spieler, aktion) {
  spieler.funk ??= neuerFunk();
  const hat = hatFunkgeraet(spieler);
  switch (aktion.was) {
    case 'an':
      if (!hat) return spielWelt.melde(spieler.id, 'Du hast kein Funkgerät dabei');
      if (!spieler.funk.an) spielWelt.melde(spieler.id, `📻 Funkgerät an – ${frequenzText(spieler.funk.frequenz)}`);
      spieler.funk.an = true;
      break;
    case 'aus':
      spieler.funk.an = false;
      spieler.funkt = false;
      break;
    case 'frequenz': {
      const f = pruefeFrequenz(aktion.wert);
      if (f !== null) spieler.funk.frequenz = f;
      break;
    }
    case 'senden':
      spieler.funkt = aktion.wert === true && funkBereit(spieler);
      break;
  }
}

/** Pro Tick (aus ueberlebenSystem bzw. vor dem Versand): wer sein Gerät verloren hat oder tot ist, sendet nicht mehr. */
export function aktualisiereFunk(spieler) {
  if (spieler.funkt && !funkBereit(spieler)) spieler.funkt = false;
}

/**
 * Partnerlisten über alle Zonen: Map spieler → { an, frequenz, partner: [{ sid, name, funkt }] }.
 * @param eintraege [{ spieler, sid }] alle Spieler im Spiel (alle Zonen)
 */
export function funkLagen(eintraege) {
  const proFrequenz = new Map();
  for (const e of eintraege) {
    aktualisiereFunk(e.spieler);
    if (!funkBereit(e.spieler)) continue;
    const f = e.spieler.funk.frequenz;
    if (!proFrequenz.has(f)) proFrequenz.set(f, []);
    proFrequenz.get(f).push(e);
  }
  const lagen = new Map();
  for (const e of eintraege) {
    const s = e.spieler;
    const funk = s.funk ?? neuerFunk();
    const bereit = funkBereit(s);
    const partner = bereit
      ? proFrequenz.get(funk.frequenz).filter((p) => p !== e).map((p) => ({ sid: p.sid, name: p.spieler.anzeigeName ?? p.spieler.name, funkt: p.spieler.funkt === true }))
      : [];
    lagen.set(s, { an: funk.an, bereit, geraet: hatFunkgeraet(s), frequenz: funk.frequenz, funkt: s.funkt === true, partner });
  }
  return lagen;
}

/** Sind zwei Spieler gerade Funkpartner (beide bereit, gleiche Frequenz)? */
export function sindFunkpartner(a, b) {
  return funkBereit(a) && funkBereit(b) && a.funk.frequenz === b.funk.frequenz;
}
