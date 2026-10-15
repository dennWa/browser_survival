import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { KACHEL_FARBEN, FARBEN } from './farben.js';

/**
 * Zeichnet die Karte EINMAL in ein Offscreen-Canvas (Vorrendern).
 * Pro Frame wird dann nur noch der sichtbare Ausschnitt kopiert → sehr schnell.
 */
export function rendereWeltBild(welt) {
  const g = welt.kachelGroesse;
  const bild = document.createElement('canvas');
  bild.width = welt.pixelBreite;
  bild.height = welt.pixelHoehe;
  const ctx = bild.getContext('2d');

  for (let ty = 0; ty < welt.hoehe; ty++) {
    for (let tx = 0; tx < welt.breite; tx++) {
      const kachel = KACHELN[welt.kachelAn(tx, ty)];
      ctx.fillStyle = KACHEL_FARBEN[kachel?.name] ?? '#ff00ff'; // Magenta = fehlende Farbe
      ctx.fillRect(tx * g, ty * g, g, g);
    }
  }

  // Dezente Rasterlinien auf Innenböden – hilft beim Abschätzen von Abständen
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  for (let ty = 0; ty < welt.hoehe; ty++) {
    for (let tx = 0; tx < welt.breite; tx++) {
      if (welt.kachelAn(tx, ty) === '.') ctx.strokeRect(tx * g + 0.5, ty * g + 0.5, g - 1, g - 1);
    }
  }

  ctx.fillStyle = FARBEN.raumName;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const raum of welt.raeume) ctx.fillText(raum.name.toUpperCase(), raum.x, raum.y);

  return bild;
}
