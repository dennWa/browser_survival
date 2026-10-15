/**
 * Merkt sich pro Figur (Schlüssel z. B. "12:koerper"), welche Animation gerade läuft und wie weit.
 * Wechselt die Animation, startet sie bei Frame 0. Rein clientseitig – der Server kennt keine Frames.
 */
const VERGESSEN_NACH_MS = 3000;

export class Animationen {
  #zustaende = new Map();

  /**
   * Schaltet die Zeit weiter und liefert den aktuellen Frame-Index.
   * @param animation  Atlas-Eintrag { frames, fps, schleife }
   * @param dt         vergangene Zeit in Sekunden
   * @param tempo      Abspielgeschwindigkeit (negativ = rückwärts, z. B. Rückwärtslaufen)
   * @param token      ändert er sich, startet die Animation neu (z. B. zweiter Schuss direkt nach dem ersten)
   */
  frame(schluessel, animation, dt, jetzt, tempo = 1, token = 0) {
    let z = this.#zustaende.get(schluessel);
    if (!z || z.animation !== animation || z.token !== token) {
      z = { animation, token, zeit: 0, gesehen: jetzt };
      this.#zustaende.set(schluessel, z);
    }
    z.zeit += dt * tempo;
    z.gesehen = jetzt;
    const roh = Math.floor(z.zeit * animation.fps);
    if (animation.schleife) return ((roh % animation.frames) + animation.frames) % animation.frames;
    return Math.max(0, Math.min(roh, animation.frames - 1));
  }

  /** true, wenn eine Einmal-Animation (z. B. Schuss) durchgelaufen ist. */
  istFertig(schluessel) {
    const z = this.#zustaende.get(schluessel);
    return !z || (!z.animation.schleife && z.zeit * z.animation.fps >= z.animation.frames);
  }

  /** Einträge entfernen, deren Figur länger nicht gezeichnet wurde (Speicher sauber halten). */
  aufraeumen(jetzt) {
    for (const [schluessel, z] of this.#zustaende) {
      if (jetzt - z.gesehen > VERGESSEN_NACH_MS) this.#zustaende.delete(schluessel);
    }
  }
}

/** Zeichnet einen Frame einer Atlas-Animation zentriert auf ihren Drehpunkt (Kamera/Rotation vorher setzen). */
export function zeichneFrame(ctx, bild, animation, index) {
  const sx = (index % animation.spalten) * animation.frameBreite;
  const sy = Math.floor(index / animation.spalten) * animation.frameHoehe;
  const m = animation.massstab;
  ctx.drawImage(
    bild,
    sx, sy, animation.frameBreite, animation.frameHoehe,
    -animation.pivotX * m, -animation.pivotY * m, animation.frameBreite * m, animation.frameHoehe * m,
  );
}
