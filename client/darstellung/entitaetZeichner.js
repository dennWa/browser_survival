import { FARBEN, GEGENSTAND_FARBEN } from './farben.js';

/**
 * Zeichenfunktionen pro Entitätstyp. Neuer Typ (z. B. 'fahrzeug')? → hier eine Funktion ergänzen.
 * Alle Koordinaten in Weltpixeln (Kamera-Transformation ist schon gesetzt).
 */
export const ZEICHNER = {
  spieler: zeichneSpieler,
  zombie: zeichneZombie,
};

const SPIELER_RADIUS = 12;
const ZOMBIE_RADIUS = 13;

function zeichneSpieler(ctx, s) {
  kreis(ctx, s.x, s.y, SPIELER_RADIUS, s.istEigener ? FARBEN.eigenerSpieler : FARBEN.andererSpieler);
  blickLinie(ctx, s.x, s.y, s.blick, SPIELER_RADIUS + 8);
  if (!s.istEigener) beschriftung(ctx, s.name, s.x, s.y - SPIELER_RADIUS - 12);
  lebensbalken(ctx, s, SPIELER_RADIUS);
}

function zeichneZombie(ctx, z) {
  kreis(ctx, z.x, z.y, ZOMBIE_RADIUS, z.zustand === 'ruhend' ? FARBEN.zombie : FARBEN.zombieAggro);
  blickLinie(ctx, z.x, z.y, z.blick, ZOMBIE_RADIUS + 5);
  if (z.leben < z.maxLeben) lebensbalken(ctx, z, ZOMBIE_RADIUS);
}

export function zeichneGegenstand(ctx, g) {
  const groesse = 10;
  ctx.fillStyle = GEGENSTAND_FARBEN[g.kategorie] ?? '#ff00ff';
  ctx.fillRect(g.x - groesse / 2, g.y - groesse / 2, groesse, groesse);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(g.x - groesse / 2, g.y - groesse / 2, groesse, groesse);
}

function kreis(ctx, x, y, r, farbe) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = farbe;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
}

function blickLinie(ctx, x, y, winkel, laenge) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(winkel) * laenge, y + Math.sin(winkel) * laenge);
  ctx.strokeStyle = FARBEN.blickLinie;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function beschriftung(ctx, text, x, y) {
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = FARBEN.name;
  ctx.fillText(text, x, y);
}

function lebensbalken(ctx, e, radius) {
  if (!e.maxLeben) return;
  const breite = radius * 2;
  const anteil = Math.max(0, e.leben / e.maxLeben);
  const y = e.y + radius + 5;
  ctx.fillStyle = FARBEN.lebenHintergrund;
  ctx.fillRect(e.x - radius, y, breite, 4);
  ctx.fillStyle = anteil > 0.35 ? FARBEN.lebenVoll : FARBEN.lebenNiedrig;
  ctx.fillRect(e.x - radius, y, breite * anteil, 4);
}
