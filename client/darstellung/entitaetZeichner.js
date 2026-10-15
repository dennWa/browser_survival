import { FARBEN, GEGENSTAND_FARBEN } from './farben.js';
import { zeichneFrame } from './animationen.js';

/**
 * Zeichenfunktionen pro Entitätstyp – mit Sprite-Animationen aus dem Atlas,
 * oder als Platzhalter-Formen, falls keine Grafiken geladen sind.
 *
 * Entitäten bringen vom ClientSpiel mit: x, y, blick, geschwindigkeit (px/s), bewegungsWinkel.
 * kontext = { assets, animationen, dt, jetzt }
 *
 * Neuer Entitätstyp? → Funktion schreiben und in ZEICHNER eintragen.
 */
export const ZEICHNER = {
  spieler: zeichneSpieler,
  zombie: zeichneZombie,
};

/** Ab dieser Geschwindigkeit (px/s) gilt eine Figur als "in Bewegung". */
const BEWEGUNGS_SCHWELLE = 12;
const SPIELER_REFERENZ_TEMPO = 150;
const ZOMBIE_REFERENZ_TEMPO = 70;
const STANDARD_AUSRUESTUNG = 'taschenlampe';
/** Gegenstände etwas größer als "realistisch", damit man sie am Boden gut erkennt. */
const ITEM_SKALIERUNG = 1.4;

function zeichneSpieler(ctx, s, k) {
  bodenSchatten(ctx, s.x, s.y, 14);
  const bewegt = (s.geschwindigkeit ?? 0) > BEWEGUNGS_SCHWELLE;
  const assets = k.assets;
  const ausruestung = s.ausruestung ?? STANDARD_AUSRUESTUNG;
  const koerper =
    assets?.figur('survivor', `${ausruestung}_${bewegt ? 'laufen' : 'idle'}`) ??
    assets?.figur('survivor', `${STANDARD_AUSRUESTUNG}_${bewegt ? 'laufen' : 'idle'}`);
  const koerperBild = koerper && assets.bild(koerper.bild);
  if (!koerperBild) return platzhalterKreis(ctx, s, 12, s.istEigener ? FARBEN.eigenerSpieler : FARBEN.andererSpieler);

  const tempo = bewegt ? Math.max(0.4, s.geschwindigkeit / SPIELER_REFERENZ_TEMPO) : 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.blick);

  // Füße unter dem Oberkörper – Lauf-/Seitwärts-/Rückwärtsschritte je nach Bewegung relativ zur Blickrichtung
  const fuss = bewegt ? fussAnimation(s.bewegungsWinkel - s.blick) : { name: 'stehen', richtung: 1 };
  const fussAnim = assets.fuesse(fuss.name);
  const fussBild = fussAnim && assets.bild(fussAnim.bild);
  if (fussBild) {
    zeichneFrame(ctx, fussBild, fussAnim, k.animationen.frame(`${s.id}:fuesse`, fussAnim, k.dt, k.jetzt, tempo * fuss.richtung));
  }
  zeichneFrame(ctx, koerperBild, koerper, k.animationen.frame(`${s.id}:koerper`, koerper, k.dt, k.jetzt, tempo));
  ctx.restore();
}

function zeichneZombie(ctx, z, k) {
  bodenSchatten(ctx, z.x, z.y, 15);
  const bewegt = (z.geschwindigkeit ?? 0) > BEWEGUNGS_SCHWELLE;
  const name = z.zustand === 'angreifend' ? 'angriff' : bewegt ? 'laufen' : 'idle';
  const animation = k.assets?.figur('zombie', name);
  const bild = animation && k.assets.bild(animation.bild);
  if (!bild) return platzhalterKreis(ctx, z, 13, z.zustand === 'ruhend' ? FARBEN.zombie : FARBEN.zombieAggro);

  const tempo = bewegt ? Math.max(0.5, z.geschwindigkeit / ZOMBIE_REFERENZ_TEMPO) : 1;
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.blick);
  zeichneFrame(ctx, bild, animation, k.animationen.frame(`${z.id}:koerper`, animation, k.dt, k.jetzt, tempo));
  ctx.restore();
}

/**
 * Welche Fuß-Animation passt zur Laufrichtung relativ zur Blickrichtung?
 * vorwärts → gehen, rückwärts → gehen rückwärts abgespielt, sonst seitwärts.
 */
function fussAnimation(relativ) {
  const w = Math.atan2(Math.sin(relativ), Math.cos(relativ)); // auf -π..π normalisieren
  const betrag = Math.abs(w);
  if (betrag <= Math.PI / 4) return { name: 'gehen', richtung: 1 };
  if (betrag >= (3 * Math.PI) / 4) return { name: 'gehen', richtung: -1 };
  return { name: w > 0 ? 'seitlich_rechts' : 'seitlich_links', richtung: 1 };
}

/** Name und Lebensbalken – separat, damit sie über Baumkronen liegen. */
export function zeichneBeschriftung(ctx, e) {
  if (e.typ === 'spieler' && !e.istEigener) {
    beschriftung(ctx, e.name, e.x, e.y - 30);
    lebensbalken(ctx, e, e.y - 24);
  } else if (e.typ === 'zombie' && e.leben < e.maxLeben) {
    lebensbalken(ctx, e, e.y - 26);
  }
}

export function zeichneGegenstand(ctx, g, assets, jetzt) {
  const icon = assets?.item(g.defId);
  const bild = assets?.itemBild;
  if (!icon || !bild) {
    const groesse = 10;
    ctx.fillStyle = GEGENSTAND_FARBEN[g.kategorie] ?? '#ff00ff';
    ctx.fillRect(g.x - groesse / 2, g.y - groesse / 2, groesse, groesse);
    return;
  }
  const faktor = (icon.weltGroesse * ITEM_SKALIERUNG) / Math.max(icon.b, icon.h);
  const b = icon.b * faktor;
  const h = icon.h * faktor;
  bodenSchatten(ctx, g.x + 2, g.y + h * 0.35, b * 0.45, 0.25);
  // Leichtes Pulsieren, damit Loot auffällt
  ctx.save();
  ctx.shadowColor = FARBEN.itemLeuchten;
  ctx.shadowBlur = 5 + Math.sin(jetzt / 400 + g.id) * 3;
  ctx.drawImage(bild, icon.x, icon.y, icon.b, icon.h, g.x - b / 2, g.y - h / 2, b, h);
  ctx.restore();
}

function bodenSchatten(ctx, x, y, radius, deckkraft = 0.3) {
  ctx.fillStyle = `rgba(0, 0, 0, ${deckkraft})`;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 4, radius, radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function platzhalterKreis(ctx, e, radius, farbe) {
  ctx.beginPath();
  ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = farbe;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(e.x + Math.cos(e.blick) * (radius + 6), e.y + Math.sin(e.blick) * (radius + 6));
  ctx.strokeStyle = FARBEN.blickLinie;
  ctx.lineWidth = 3;
  ctx.stroke();
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
