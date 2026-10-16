import { FARBEN } from './farben.js';

/**
 * 2D-Beschriftungen über der 3D-Szene (auf dem durchsichtigen Overlay-Canvas):
 * Namen anderer Spieler, Lebensbalken verletzter Figuren. x/y sind bereits Bildschirmkoordinaten.
 */
export function zeichneBeschriftung(ctx, e) {
  if (e.typ === 'spieler' && !e.istEigener && !e.tot) {
    beschriftung(ctx, e.gottmodus ? `${e.name} ⚡` : e.name, e.x, e.y - 30);
    lebensbalken(ctx, e, e.y - 24);
  } else if (e.typ === 'zombie' && e.leben < e.maxLeben) {
    lebensbalken(ctx, e, e.y - 26);
  }
}

function beschriftung(ctx, text, x, y) {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = FARBEN.name;
  ctx.fillText(text, x, y);
}

function lebensbalken(ctx, e, y) {
  if (!e.maxLeben) return;
  const breite = 28;
  const anteil = Math.max(0, e.leben / e.maxLeben);
  ctx.fillStyle = FARBEN.lebenHintergrund;
  ctx.fillRect(e.x - breite / 2, y, breite, 4);
  ctx.fillStyle = anteil > 0.35 ? FARBEN.lebenVoll : FARBEN.lebenNiedrig;
  ctx.fillRect(e.x - breite / 2, y, breite * anteil, 4);
}
