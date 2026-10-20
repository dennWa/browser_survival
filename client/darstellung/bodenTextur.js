import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { eigeneGroesse } from '../../gemeinsam/welt/drehung.js';
import { FARBEN, KACHEL_FARBEN } from './farben.js';

/**
 * Malt den Boden der ganzen Karte in ein Canvas (wird im 3D-Renderer zur Bodentextur):
 * Bodentexturen aus dem Atlas bzw. prozedural (Asphalt, Straße mit Markierungen, Gehwegplatten),
 * Bodendeko (Teppiche, Blut, Parkplatzmarkierungen) und Türschwellen.
 * Wände, Möbel und Bäume sind im 3D-Renderer echte Körper und fehlen hier bewusst.
 * Schneezonen (welt.schnee): Kachel 'schnee' prozedural (bläulich-weiße Verwehungen, Glitzer); Straßen/Gehwege/Asphalt sind
 * verschneit (Ränder zum Schnee dicht, in der Mitte lückenhaft – man sieht den Asphalt noch), Wasser ist Eis.
 */
export class BodenTextur {
  constructor(welt, assets) {
    this.welt = welt;
    this.assets = assets;
    this.g = welt.kachelGroesse;
    this.bodenObjekte = welt.objekte.filter((o) => o.ebene === 'boden');
    /** Bemalung aus dem Map-Editor: { '#rrggbb': [[x, y, b, h], …] } (Kacheln) – als halbtransparente Farbe über dem Boden */
    this.bemalung = welt.bemalung ?? null;
  }

  /** @param massstab Pixel pro Weltpixel */
  rendere(massstab = 1) {
    const it = this.renderePortionen(massstab);
    let schritt = it.next();
    while (!schritt.done) schritt = it.next();
    return schritt.value;
  }

  /** Wie rendere(), aber als Generator: gibt nach jeweils einigen Kachelzeilen ab (Nachbarkarte baut sich ruckelfrei im Hintergrund); Ergebnis = Canvas */
  *renderePortionen(massstab = 1) {
    const canvas = neuesCanvas(this.welt.pixelBreite * massstab, this.welt.pixelHoehe * massstab);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(massstab, 0, 0, massstab, 0, 0);
    for (let ty = 0; ty < this.welt.hoehe; ty++) {
      for (let tx = 0; tx < this.welt.breite; tx++) this.#zeichneBoden(ctx, tx, ty);
      if (ty % 4 === 3) yield;
    }
    if (this.bemalung) {
      ctx.globalAlpha = 0.55;
      for (const [farbe, rechtecke] of Object.entries(this.bemalung)) {
        ctx.fillStyle = farbe;
        for (const [x, y, b, h] of rechtecke) ctx.fillRect(x * this.g, y * this.g, b * this.g, h * this.g);
      }
      ctx.globalAlpha = 1;
    }
    for (const o of this.bodenObjekte) this.#zeichneObjekt(ctx, o);
    for (let ty = 0; ty < this.welt.hoehe; ty++) {
      for (let tx = 0; tx < this.welt.breite; tx++) {
        if (KACHELN[this.welt.kachelAn(tx, ty)]?.name === 'tuer') this.#zeichneTuerschwelle(ctx, tx, ty);
      }
    }
    return canvas;
  }

  #zeichneBoden(ctx, tx, ty) {
    const g = this.g;
    let name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    if (name === 'tuer') name = this.#tuerBoden(tx, ty);
    if (name === 'wand' || name === 'fenster') return; // wird komplett übermalt

    const x = tx * g;
    const y = ty * g;
    if (name === 'schnee') {
      this.#schnee(ctx, tx, ty, x, y);
      return;
    }
    const varianten = this.assets?.boden(name);
    const bild = this.assets?.umgebungBild;
    if (varianten && bild) {
      const h = streuwert(tx, ty);
      const v = varianten[h % varianten.length];
      if (name === 'gras') {
        // Gras zusätzlich drehen → kein sichtbares Kachelmuster
        ctx.save();
        ctx.translate(x + g / 2, y + g / 2);
        ctx.rotate(((h >> 4) % 4) * (Math.PI / 2));
        ctx.drawImage(bild, v.x, v.y, v.b, v.h, -g / 2 - 0.25, -g / 2 - 0.25, g + 0.5, g + 0.5);
        ctx.restore();
        this.#grasTon(ctx, tx, ty, x, y);
      } else {
        ctx.drawImage(bild, v.x, v.y, v.b, v.h, x, y, g + 0.25, g + 0.25);
      }
      return;
    }

    // Prozedurale Böden (Asphalt, Straße) bzw. Ersatzfarben ohne Assets
    ctx.fillStyle = KACHEL_FARBEN[name] ?? '#ff00ff';
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    if (name === 'asphalt' || name === 'strasse') this.#asphaltKoernung(ctx, tx, ty);
    if (name === 'strasse') this.#strassenMarkierung(ctx, tx, ty);
    if (name === 'gehweg') this.#gehwegPlatten(ctx, tx, ty);
    if (name === 'wasser') this.#wasser(ctx, tx, ty);
    if (this.welt.schnee) {
      if (name === 'asphalt' || name === 'strasse' || name === 'gehweg') this.#strassenSchnee(ctx, tx, ty);
      if (name === 'wasser') this.#eis(ctx, tx, ty);
    }
  }

  /**
   * Schnee: helle, leicht bläuliche Fläche mit großflächigen Verwehungen (Rauschen von Schatten-Blau bis Reinweiß),
   * ein paar weichen Mulden und Glitzerpunkten. Absichtlich nicht ganz weiß, sonst brennt der Boden im Sonnenlicht aus.
   */
  #schnee(ctx, tx, ty, x, y) {
    const g = this.g;
    const n = wertRauschen(tx * 0.13 + 11, ty * 0.13 + 5) * 0.7 + wertRauschen(tx * 0.5 + 90, ty * 0.5 + 33) * 0.3; // 0..1
    ctx.fillStyle = '#d3e0ec';
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    ctx.fillStyle = n > 0.5 ? `rgba(250, 253, 255, ${((n - 0.5) * 1.1).toFixed(3)})` : `rgba(120, 150, 190, ${((0.5 - n) * 0.55).toFixed(3)})`;
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    const h = streuwert(tx * 5 + 1, ty * 11 + 9);
    for (let i = 0; i < 3; i++) {
      const bx = x + ((h >> (i * 5)) % g);
      const by = y + ((h >> (i * 5 + 2)) % g);
      const hell = (h >> (i + 9)) % 3 !== 0;
      const verlauf = ctx.createRadialGradient(bx, by, 0, bx, by, 10);
      verlauf.addColorStop(0, hell ? 'rgba(255, 255, 255, 0.35)' : 'rgba(110, 140, 185, 0.22)');
      verlauf.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = verlauf;
      ctx.fillRect(bx - 10, by - 10, 20, 20);
    }
    // Glitzer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (let i = 0; i < 2; i++) ctx.fillRect(x + ((h >> (i * 7 + 3)) % (g - 2)), y + ((h >> (i * 7 + 11)) % (g - 2)), 1.5, 1.5);
  }

  /** Verschneite Straße: Schnee am Rand zum Schneeland dicht, sonst lückenhafte Flecken – der Asphalt bleibt erkennbar. */
  #strassenSchnee(ctx, tx, ty) {
    const g = this.g;
    const x = tx * g;
    const y = ty * g;
    const istSchnee = (dx, dy) => KACHELN[this.welt.kachelAn(tx + dx, ty + dy)]?.name === 'schnee';
    const rand = 11;
    ctx.fillStyle = 'rgba(232, 240, 248, 0.88)';
    const seiten = [[0, -1, x, y, g, rand], [0, 1, x, y + g - rand, g, rand], [-1, 0, x, y, rand, g], [1, 0, x + g - rand, y, rand, g]];
    for (const [dx, dy, sx, sy, sb, sh] of seiten) {
      if (!istSchnee(dx, dy)) continue;
      const v = dx === 0 ? ctx.createLinearGradient(0, dy < 0 ? sy : sy + sh, 0, dy < 0 ? sy + sh : sy) : ctx.createLinearGradient(dx < 0 ? sx : sx + sb, 0, dx < 0 ? sx + sb : sx, 0);
      v.addColorStop(0, 'rgba(232, 240, 248, 0.92)');
      v.addColorStop(1, 'rgba(232, 240, 248, 0)');
      ctx.fillStyle = v;
      ctx.fillRect(sx, sy, sb, sh);
    }
    const n = wertRauschen(tx * 0.2 + 3, ty * 0.2 + 17);
    const dichte = 0.18 + 0.5 * n; // stellenweise fast frei, stellenweise zugeweht
    const h = streuwert(tx * 3 + 7, ty * 5 + 1);
    for (let i = 0; i < 6; i++) {
      if (((h >> (i * 3)) % 10) / 10 > dichte + 0.25) continue;
      const bx = x + ((h >> (i * 4)) % g);
      const by = y + ((h >> (i * 4 + 5)) % g);
      const r = 5 + ((h >> (i + 2)) % 6);
      const verlauf = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      verlauf.addColorStop(0, `rgba(238, 244, 250, ${(0.35 + dichte * 0.5).toFixed(2)})`);
      verlauf.addColorStop(1, 'rgba(238, 244, 250, 0)');
      ctx.fillStyle = verlauf;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
  }

  /** Zugefrorener See: das Blau wird blass und milchig, Risse als dünne helle Linien. */
  #eis(ctx, tx, ty) {
    const g = this.g;
    ctx.fillStyle = 'rgba(205, 228, 242, 0.62)';
    ctx.fillRect(tx * g, ty * g, g + 0.25, g + 0.25);
    const h = streuwert(tx * 13 + 2, ty * 7 + 6);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = tx * g + (h % g);
    const y0 = ty * g + ((h >> 6) % g);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + ((h >> 10) % 15) - 7, y0 + ((h >> 14) % 15) - 7);
    ctx.stroke();
  }
  /**
   * Rasen dunkler und lebendiger: Grundabdunklung + großflächiges Rauschen (Wiesenflecken von sattgrün bis olivgelb/blaugrün)
   * + ein paar kleine weiche Flecken pro Kachel. Deterministisch aus der Kachelposition.
   */
  #grasTon(ctx, tx, ty, x, y) {
    const g = this.g;
    const n = wertRauschen(tx * 0.16, ty * 0.16) * 0.85 + wertRauschen(tx * 0.55 + 40, ty * 0.55 + 7) * 0.15; // 0..1
    ctx.fillStyle = 'rgba(6, 34, 12, 0.5)';
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    ctx.fillStyle = n > 0.5 ? `rgba(120, 132, 28, ${((n - 0.5) * 0.45).toFixed(3)})` : `rgba(0, 40, 36, ${((0.5 - n) * 0.5).toFixed(3)})`;
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    const h = streuwert(tx * 7 + 3, ty * 13 + 5);
    for (let i = 0; i < 3; i++) {
      const bx = x + ((h >> (i * 5)) % 32);
      const by = y + ((h >> (i * 5 + 2)) % 32);
      const hell = (h >> (i + 9)) % 2 === 0;
      const verlauf = ctx.createRadialGradient(bx, by, 0, bx, by, 9);
      verlauf.addColorStop(0, hell ? 'rgba(110, 150, 40, 0.22)' : 'rgba(0, 20, 8, 0.28)');
      verlauf.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = verlauf;
      ctx.fillRect(bx - 9, by - 9, 18, 18);
    }
  }

  /** See: tiefes Blau in der Mitte, helle Uferkante zum Land, ein paar Wellenstriche (die bewegten Wellen liegen in kartenModell). */
  #wasser(ctx, tx, ty) {
    const g = this.g;
    const istWasser = (x, y) => KACHELN[this.welt.kachelAn(x, y)]?.wasser === true;
    let tief = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!istWasser(tx + dx, ty + dy)) tief = false;
    if (tief) {
      ctx.fillStyle = 'rgba(10, 40, 90, 0.35)';
      ctx.fillRect(tx * g, ty * g, g + 0.25, g + 0.25);
    }
    // Ufer: helle Kante, wo Land angrenzt
    ctx.fillStyle = 'rgba(214, 238, 246, 0.55)';
    if (!istWasser(tx, ty - 1)) ctx.fillRect(tx * g, ty * g, g, 3);
    if (!istWasser(tx, ty + 1)) ctx.fillRect(tx * g, ty * g + g - 3, g, 3);
    if (!istWasser(tx - 1, ty)) ctx.fillRect(tx * g, ty * g, 3, g);
    if (!istWasser(tx + 1, ty)) ctx.fillRect(tx * g + g - 3, ty * g, 3, g);
    let h = streuwert(tx, ty);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const x = tx * g + 4 + (h % (g - 14));
      const y = ty * g + 6 + ((h >> 8) % (g - 12));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y);
      ctx.stroke();
    }
  }
  #asphaltKoernung(ctx, tx, ty) {
    const g = this.g;
    let h = streuwert(tx, ty);
    for (let i = 0; i < 7; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      ctx.fillStyle = h & 1 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(tx * g + (h % g), ty * g + ((h >> 8) % g), 2 + ((h >> 16) % 3), 2);
    }
  }
  #strassenMarkierung(ctx, tx, ty) {
    const g = this.g;
    const istStrasse = (x, y) => KACHELN[this.welt.kachelAn(x, y)]?.name === 'strasse';
    // Richtung der Straße: lang in x → waagerecht, lang in y → senkrecht (Kreuzung: beides → keine Linien)
    const waagerecht = istStrasse(tx - 2, ty) && istStrasse(tx + 2, ty);
    const senkrecht = istStrasse(tx, ty - 2) && istStrasse(tx, ty + 2);
    if (waagerecht && senkrecht) return;
    ctx.fillStyle = FARBEN.markierung;
    if (waagerecht || !senkrecht) {
      if (istStrasse(tx, ty - 1) && istStrasse(tx, ty + 1) && tx % 3 !== 0) ctx.fillRect(tx * g, ty * g + g / 2 - 1.5, g, 3);
      if (!istStrasse(tx, ty - 1)) ctx.fillRect(tx * g, ty * g + 2, g, 2);
      if (!istStrasse(tx, ty + 1)) ctx.fillRect(tx * g, ty * g + g - 4, g, 2);
    } else {
      if (istStrasse(tx - 1, ty) && istStrasse(tx + 1, ty) && ty % 3 !== 0) ctx.fillRect(tx * g + g / 2 - 1.5, ty * g, 3, g);
      if (!istStrasse(tx - 1, ty)) ctx.fillRect(tx * g + 2, ty * g, 2, g);
      if (!istStrasse(tx + 1, ty)) ctx.fillRect(tx * g + g - 4, ty * g, 2, g);
    }
  }
  #gehwegPlatten(ctx, tx, ty) {
    const g = this.g;
    const h = streuwert(tx, ty);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + (h % 5) * 0.012})`;
    ctx.fillRect(tx * g, ty * g, g / 2, g / 2);
    ctx.fillRect(tx * g + g / 2, ty * g + g / 2, g / 2, g / 2);
    ctx.fillStyle = 'rgba(40, 42, 46, 0.45)';
    ctx.fillRect(tx * g, ty * g, g, 1);
    ctx.fillRect(tx * g, ty * g + g / 2, g, 1);
    ctx.fillRect(tx * g, ty * g, 1, g);
    ctx.fillRect(tx * g + g / 2, ty * g, 1, g);
  }
  #tuerBoden(tx, ty) {
    const nachbarn = [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]].map(([x, y]) => KACHELN[this.welt.kachelAn(x, y)]);
    return (nachbarn.find((k) => k?.innen) ?? nachbarn.find((k) => k && !k.blockiert && k.name !== 'tuer'))?.name ?? 'beton';
  }
  #istWandig(tx, ty) {
    const name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    return name === 'wand' || name === 'fenster';
  }
  #zeichneTuerschwelle(ctx, tx, ty) {
    const g = this.g;
    const waagerecht = this.#istWandig(tx - 1, ty) || this.#istWandig(tx + 1, ty) || this.welt.kachelAn(tx - 1, ty) === 'T' || this.welt.kachelAn(tx + 1, ty) === 'T';
    ctx.fillStyle = FARBEN.tuerschwelle;
    if (waagerecht) ctx.fillRect(tx * g, ty * g + g * 0.4, g, g * 0.2);
    else ctx.fillRect(tx * g + g * 0.4, ty * g, g * 0.2, g);
    // Türpfosten neben Wänden
    ctx.fillStyle = FARBEN.wandKante;
    if (waagerecht) {
      if (this.#istWandig(tx - 1, ty)) ctx.fillRect(tx * g, ty * g + g * 0.3, 4, g * 0.4);
      if (this.#istWandig(tx + 1, ty)) ctx.fillRect(tx * g + g - 4, ty * g + g * 0.3, 4, g * 0.4);
    } else {
      if (this.#istWandig(tx, ty - 1)) ctx.fillRect(tx * g + g * 0.3, ty * g, g * 0.4, 4);
      if (this.#istWandig(tx, ty + 1)) ctx.fillRect(tx * g + g * 0.3, ty * g + g - 4, g * 0.4, 4);
    }
  }
  #zeichneObjekt(ctx, o) {
    const g = this.g;
    if (o.typ === 'markierung') {
      // Fahrbahn-/Parkplatzmarkierung: einfache weiße Linie
      ctx.fillStyle = FARBEN.markierung;
      ctx.fillRect(o.x * g, o.y * g, o.b * g, o.h * g);
      return;
    }
    const b = o.b * g;
    const h = o.h * g;
    const mx = o.x * g + b / 2;
    const my = o.y * g + h / 2;
    const rahmen = this.assets?.objekt(o.typ);
    const bild = this.assets?.umgebungBild;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(((o.drehung ?? 0) * Math.PI) / 180);
    // eigene Maße vor dem Drehen (gemeinsam/welt/drehung.js) – frei gedrehte Objekte (Map-Editor 5.5) passen so zur Kollision
    const eigen = eigeneGroesse(o);
    const zb = eigen.b * g;
    const zh = eigen.h * g;
    if (rahmen && bild) {
      ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, -zb / 2, -zh / 2, zb, zh);
    } else {
      ctx.fillStyle = FARBEN.moebelErsatz;
      ctx.fillRect(-zb / 2 + 2, -zh / 2 + 2, zb - 4, zh - 4);
    }
    ctx.restore();
  }}

/** Deterministische Pseudo-Zufallszahl pro Kachel (gleiche Kachel → gleiche Variante). */
function streuwert(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function neuesCanvas(breite, hoehe) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(breite));
  canvas.height = Math.max(1, Math.round(hoehe));
  return canvas;
}

/** Glattes Wertrauschen 0..1 (bilinear zwischen Gitterwerten) */
function wertRauschen(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const w = (a, b) => (streuwert(a * 31 + 7, b * 17 + 3) % 1000) / 1000;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const oben = w(ix, iy) * (1 - sx) + w(ix + 1, iy) * sx;
  const unten = w(ix, iy + 1) * (1 - sx) + w(ix + 1, iy + 1) * sx;
  return oben * (1 - sy) + unten * sy;
}
