import { FARBEN } from './farben.js';

/**
 * 2D-Beschriftungen über der 3D-Szene (auf dem durchsichtigen Overlay-Canvas):
 * Namen anderer Spieler, Lebensbalken verletzter Figuren, Chat-Sprechblasen. x/y sind bereits Bildschirmkoordinaten.
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

/** Kleiner Name über einem Item am Boden. */
export function zeichneItemName(ctx, text, x, y) {
  ctx.font = '500 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = 'rgba(240, 236, 224, 0.92)';
  ctx.fillText(text, x, y);
}

const BLASE = { breite: 190, zeilen: 3, schrift: '500 11px system-ui, sans-serif', zeile: 14, rand: 6, spitze: 6 };

/** Chat-Text in Zeilen umbrechen (höchstens BLASE.zeilen, Rest mit „…“). */
export function blasenZeilen(ctx, text, breite = BLASE.breite, maxZeilen = BLASE.zeilen) {
  const woerter = String(text).split(/\s+/).filter(Boolean);
  const zeilen = [];
  let aktuell = '';
  for (const wort of woerter) {
    const probe = aktuell ? `${aktuell} ${wort}` : wort;
    if (ctx.measureText(probe).width <= breite || !aktuell) aktuell = probe;
    else {
      zeilen.push(aktuell);
      aktuell = wort;
    }
  }
  if (aktuell) zeilen.push(aktuell);
  for (let i = 0; i < zeilen.length; i++) {
    // überlange Einzelwörter kürzen
    while (ctx.measureText(zeilen[i]).width > breite && zeilen[i].length > 1) zeilen[i] = zeilen[i].slice(0, -2) + '…';
  }
  if (zeilen.length > maxZeilen) {
    zeilen.length = maxZeilen;
    let letzte = zeilen[maxZeilen - 1];
    while (ctx.measureText(`${letzte}…`).width > breite && letzte.length > 1) letzte = letzte.slice(0, -1);
    zeilen[maxZeilen - 1] = `${letzte}…`;
  }
  return zeilen;
}

/**
 * Rechteckige Sprechblase mit kleiner Spitze nach unten (Chat über dem Kopf, Runde 18).
 * @param x,y  Bildschirmpunkt, auf den die Spitze zeigt (über dem Kopf)
 * @param deckkraft 0..1 (Ausblenden)
 */
export function zeichneSprechblase(ctx, text, x, y, deckkraft = 1) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, deckkraft));
  ctx.font = BLASE.schrift;
  const zeilen = blasenZeilen(ctx, text);
  const textBreite = Math.max(...zeilen.map((z) => ctx.measureText(z).width), 10);
  const b = Math.ceil(textBreite + BLASE.rand * 2);
  const h = zeilen.length * BLASE.zeile + BLASE.rand * 2 - 2;
  const links = Math.round(x - b / 2);
  const oben = Math.round(y - BLASE.spitze - h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = 'rgba(20, 22, 28, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(links, oben);
  ctx.lineTo(links + b, oben);
  ctx.lineTo(links + b, oben + h);
  ctx.lineTo(x + BLASE.spitze, oben + h);
  ctx.lineTo(x, oben + h + BLASE.spitze);
  ctx.lineTo(x - BLASE.spitze, oben + h);
  ctx.lineTo(links, oben + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#16181d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  zeilen.forEach((z, i) => ctx.fillText(z, x, oben + BLASE.rand + i * BLASE.zeile));
  ctx.restore();
}
