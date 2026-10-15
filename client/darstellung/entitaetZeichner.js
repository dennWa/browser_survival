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
  if (s.tot) return; // Leiche = Blutlache aus den Effekten
  bodenSchatten(ctx, s.x, s.y, 14);
  const bewegt = (s.geschwindigkeit ?? 0) > BEWEGUNGS_SCHWELLE;
  const assets = k.assets;
  const ausruestung = s.ausruestung ?? STANDARD_AUSRUESTUNG;
  // Laufende Aktion (Schuss, Nachladen, Nahkampf) hat Vorrang vor Gehen/Stehen
  const aktionsAnim = s.aktion ? assets?.figur('survivor', `${ausruestung}_${s.aktion}`) : null;
  const koerper =
    aktionsAnim ??
    assets?.figur('survivor', `${ausruestung}_${bewegt ? 'laufen' : 'idle'}`) ??
    assets?.figur('survivor', `${STANDARD_AUSRUESTUNG}_${bewegt ? 'laufen' : 'idle'}`);
  const koerperBild = koerper && assets.bild(koerper.bild);
  if (!koerperBild) return platzhalterKreis(ctx, s, 12, s.istEigener ? FARBEN.eigenerSpieler : FARBEN.andererSpieler);

  const laufTempo = bewegt ? Math.max(0.4, s.geschwindigkeit / SPIELER_REFERENZ_TEMPO) : 1;
  const tempo = aktionsAnim ? aktionsTempo(aktionsAnim, s.aktionDauer) : laufTempo;
  const token = aktionsAnim ? s.aktionTick : 0;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.blick);

  // Füße unter dem Oberkörper – Lauf-/Seitwärts-/Rückwärtsschritte je nach Bewegung relativ zur Blickrichtung
  const fuss = bewegt ? fussAnimation(s.bewegungsWinkel - s.blick, s.geschwindigkeit) : { name: 'stehen', richtung: 1 };
  const fussAnim = assets.fuesse(fuss.name);
  const fussBild = fussAnim && assets.bild(fussAnim.bild);
  if (fussBild) {
    // Renn-Animation ist für Sprinttempo gemacht → auf Sprintgeschwindigkeit normieren
    const fussTempo = fuss.name === 'rennen' ? s.geschwindigkeit / (SPIELER_REFERENZ_TEMPO * 1.6) : laufTempo;
    zeichneFrame(ctx, fussBild, fussAnim, k.animationen.frame(`${s.id}:fuesse`, fussAnim, k.dt, k.jetzt, fussTempo * fuss.richtung));
  }
  zeichneFrame(ctx, koerperBild, koerper, k.animationen.frame(`${s.id}:koerper`, koerper, k.dt, k.jetzt, tempo, token));
  ctx.restore();
}

function zeichneZombie(ctx, z, k) {
  const groesse = z.groesse ?? 1;
  bodenSchatten(ctx, z.x, z.y, 15 * groesse);
  const bewegt = (z.geschwindigkeit ?? 0) > BEWEGUNGS_SCHWELLE;
  const greiftAn = z.aktion === 'angriff';
  const name = greiftAn ? 'angriff' : bewegt ? 'laufen' : 'idle';
  // Varianten (Läufer, Brocken) haben eigene, umgefärbte Sprites – sonst Standard-Zombie
  const animation = k.assets?.figur(`zombie_${z.variante}`, name) ?? k.assets?.figur('zombie', name);
  const bild = animation && k.assets.bild(animation.bild);
  if (!bild) return platzhalterKreis(ctx, z, 13, z.zustand === 'ruhend' ? FARBEN.zombie : FARBEN.zombieAggro);

  const tempo = greiftAn ? aktionsTempo(animation, z.aktionDauer) : bewegt ? Math.max(0.5, z.geschwindigkeit / ZOMBIE_REFERENZ_TEMPO) : 1;
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.blick);
  ctx.scale(groesse, groesse);
  zeichneFrame(ctx, bild, animation, k.animationen.frame(`${z.id}:koerper`, animation, k.dt, k.jetzt, tempo, greiftAn ? z.aktionTick : 0));
  ctx.restore();
}

/** Abspieltempo, damit eine Animation genau so lange läuft wie die Aktion auf dem Server. */
function aktionsTempo(animation, dauer) {
  return animation.frames / animation.fps / Math.max(0.05, dauer || 0.3);
}

/**
 * Welche Fuß-Animation passt zur Laufrichtung relativ zur Blickrichtung?
 * vorwärts → gehen, rückwärts → gehen rückwärts abgespielt, sonst seitwärts.
 */
function fussAnimation(relativ, geschwindigkeit) {
  const w = Math.atan2(Math.sin(relativ), Math.cos(relativ)); // auf -π..π normalisieren
  const betrag = Math.abs(w);
  if (betrag <= Math.PI / 4) return { name: geschwindigkeit > SPIELER_REFERENZ_TEMPO * 1.25 ? 'rennen' : 'gehen', richtung: 1 };
  if (betrag >= (3 * Math.PI) / 4) return { name: 'gehen', richtung: -1 };
  return { name: w > 0 ? 'seitlich_rechts' : 'seitlich_links', richtung: 1 };
}

/** Name und Lebensbalken – separat, damit sie über Baumkronen liegen. */
export function zeichneBeschriftung(ctx, e) {
  if (e.typ === 'spieler' && !e.istEigener && !e.tot) {
    beschriftung(ctx, e.name, e.x, e.y - 30);
    lebensbalken(ctx, e, e.y - 24);
  } else if (e.typ === 'zombie' && e.leben < e.maxLeben) {
    lebensbalken(ctx, e, e.y - 26);
  }
}

export function zeichneGegenstand(ctx, g, assets, jetzt, markiert = false) {
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
  bodenSchatten(ctx, g.x, g.y + h * 0.15, Math.min(b, h) * 0.45, 0.2);
  // Leichtes Pulsieren, damit Loot auffällt
  ctx.save();
  ctx.shadowColor = FARBEN.itemLeuchten;
  ctx.shadowBlur = markiert ? 14 + Math.sin(jetzt / 150) * 4 : 5 + Math.sin(jetzt / 400 + g.id) * 3;
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
