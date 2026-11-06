import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { eigeneGroesse } from '../../gemeinsam/welt/drehung.js';
import { FARBEN, KACHEL_FARBEN } from './farben.js';

/**
 * Malt den Boden der ganzen Karte in ein Canvas (wird im 3D-Renderer zur Bodentextur):
 * Bodentexturen aus dem Atlas bzw. prozedural (Asphalt, Straße mit Markierungen, Gehwegplatten),
 * Bodendeko (Teppiche, Blut, Parkplatzmarkierungen) und Türschwellen.
 * Wände, Möbel und Bäume sind im 3D-Renderer echte Körper und fehlen hier bewusst.

 * Runde 37: Innenböden holz/fliesen/beton = durchgehende Fläche (#innenBoden), Asphalt ohne Körnung (#weicherTon).
 * Schneezonen (welt.schnee): Kachel 'schnee' prozedural (bläulich-weiße Verwehungen, Glitzer); Straßen/Gehwege/Asphalt sind
 * verschneit (Ränder zum Schnee dicht, in der Mitte lückenhaft – man sieht den Asphalt noch), Wasser ist Eis.
 */
/** Böden, in die der Rasen weich hineinwächst (#grasRand) – Farbe ≈ abgedunkelter Rasen nach #grasTon */
const GRAS_RAND_BOEDEN = new Set(['asphalt', 'strasse', 'gehweg', 'holz', 'beton', 'fliesen', 'pflaster']);
/**
 * Naturböden blenden an Kanten weich ineinander (#weicheRaender, Phase 4.13): Wert = Rang (höher wächst in niedriger hinein).
 * Statt gerader Streifen eine Rausch-Maske in WELT-Koordinaten → unregelmäßige, über Kachelgrenzen durchgehende Ränder,
 * auch über Ecken (Diagonal-Nachbarn). Gras (Atlas) und Schnee machen mit.
 */
const WEICHE_BOEDEN = { sand: 1, erde: 2, kies: 3, waldboden: 4, wildwald: 4.5, wiese: 5, gras: 6, schnee: 6.5, rasen: 7 };
const UEBERGANG_TIEFE = 0.85; // so weit (Anteil der Kachel) reicht der Nachbarboden höchstens hinein
const ACHT = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const GRAS_RAND_FARBE = (a) => `rgba(46, 72, 28, ${a})`;

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

  /**
   * Wie rendere(), aber als Generator: gibt nach jeweils einigen Kachelzeilen ab (Nachbarkarte baut sich ruckelfrei im
   * Hintergrund); Ergebnis = Canvas.
   * @param bereich  Runde 19 (Boden-Blöcke): nur Kacheln { x0, y0, x1, y1 } (x1/y1 exklusiv) – das Canvas ist so groß wie der
   *   Ausschnitt; Nachbarkacheln (1 Kachel Rand) werden mitgemalt, damit Übergänge über die Blockgrenze gleich aussehen
   *   (alles ist deterministisch, kein Zufall) – so passen benachbarte Blöcke nahtlos aneinander.
   */
  *renderePortionen(massstab = 1, bereich = null) {
    const w = this.welt;
    const r = bereich ?? { x0: 0, y0: 0, x1: w.breite, y1: w.hoehe };
    const canvas = neuesCanvas((r.x1 - r.x0) * this.g * massstab, (r.y1 - r.y0) * this.g * massstab);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(massstab, 0, 0, massstab, -r.x0 * this.g * massstab, -r.y0 * this.g * massstab);
    const xa = Math.max(0, r.x0 - 1);
    const xe = Math.min(w.breite, r.x1 + 1);
    const ya = Math.max(0, r.y0 - 1);
    const ye = Math.min(w.hoehe, r.y1 + 1);
    for (let ty = ya; ty < ye; ty++) {
      for (let tx = xa; tx < xe; tx++) this.#zeichneBoden(ctx, tx, ty);
      if (ty % 4 === 3) yield;
    }
    // Runde 18 (6.2): Rasen läuft weich in Asphalt/Holz & Co. aus (eigener Durchgang, damit spätere Kacheln ihn nicht übermalen)
    for (let ty = ya; ty < ye; ty++) {
      for (let tx = xa; tx < xe; tx++) {
        this.#weicheRaender(ctx, tx, ty);
        this.#grasRand(ctx, tx, ty);
      }
      if (ty % 8 === 7) yield;
    }
    // Runde 23: Boden unter Wänden/Fenstern einfarbig zuletzt – sonst lagen Schnee-/Rasen-Ränder der Nachbarn darin und
    // tauchten als Flecken auf, sobald die Wand beim Betreten des Hauses durchsichtig wird
    ctx.fillStyle = FARBEN.wandBoden;
    for (let ty = ya; ty < ye; ty++) {
      for (let tx = xa; tx < xe; tx++) {
        const k = KACHELN[this.welt.kachelAn(tx, ty)];
        if (k?.wand || k?.name === 'fenster') ctx.fillRect(tx * this.g, ty * this.g, this.g + 0.25, this.g + 0.25);
      }
    }
    if (this.bemalung) {
      ctx.globalAlpha = 0.55;
      for (const [farbe, rechtecke] of Object.entries(this.bemalung)) {
        ctx.fillStyle = farbe;
        for (const [x, y, b, h] of rechtecke) ctx.fillRect(x * this.g, y * this.g, b * this.g, h * this.g);
      }
      ctx.globalAlpha = 1;
    }
    // Bodenobjekte nur, wenn sie den Ausschnitt (+ Rand) berühren – das Canvas schneidet den Rest ab
    for (const o of this.bodenObjekte) if (o.x < xe && o.x + o.b > xa && o.y < ye && o.y + o.h > ya) this.#zeichneObjekt(ctx, o);
    for (let ty = ya; ty < ye; ty++) {
      for (let tx = xa; tx < xe; tx++) {
        if (KACHELN[this.welt.kachelAn(tx, ty)]?.name === 'tuer') this.#zeichneTuerschwelle(ctx, tx, ty);
      }
    }
    return canvas;
  }

  /** @param art  andere Bodenart an dieser Stelle malen (weiche Ränder: Nachbarboden in diese Kachel) */
  #zeichneBoden(ctx, tx, ty, art = null) {
    const g = this.g;
    let name = art ?? KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    if (name === 'tuer') name = this.#tuerBoden(tx, ty);
    if (!art && (KACHELN[this.welt.kachelAn(tx, ty)]?.wand || name === 'fenster')) return; // wird komplett übermalt

    const x = tx * g;
    const y = ty * g;
    if (name === 'schnee') {
      this.#schnee(ctx, tx, ty, x, y);
      return;
    }
    // Runde 26: Fototextur (weltfest, ein Bild deckt `kacheln`×`kacheln` Kacheln → keine sichtbare Wiederholung je Kachel)
    const foto = this.assets?.bodenTextur?.(name);
    if (foto) {
      this.#fotoStueck(ctx, foto, tx, ty, 0, 0, g, g);
      return;
    }
    if (name === 'holz' || name === 'fliesen' || name === 'beton') {
      this.#innenBoden(ctx, tx, ty, name);
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
    if (name === 'asphalt' || name === 'strasse') this.#weicherTon(ctx, tx, ty, 0.07); // Runde 37: keine Körnchen mehr, nur sanfte Tönung
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

  /**
   * Weicher Rasenrand (Runde 18, 6.2): Grenzt eine harte Bodenkachel (Asphalt, Straße, Gehweg, Holz, Beton, Fliesen) an Rasen,
   * wächst das Gras als Verlauf + unregelmäßige Büschel ein Stück hinein – keine schnurgerade Kachelkante mehr.
   * Diagonal angrenzender Rasen gibt nur einen kleinen Eckfleck. Deterministisch aus der Kachelposition.
   */
  /** Ausschnitt (dx, dy, b, h in Weltpixeln relativ zur Kachel) der weltfesten Fototextur auf die Kachel malen */
  #fotoStueck(ctx, foto, tx, ty, dx, dy, b, h) {
    const g = this.g;
    const n = foto.kacheln;
    const s = foto.bild.width / (n * g); // Bildpixel je Weltpixel
    const ux = (((tx % n) + n) % n) * g + dx;
    const uy = (((ty % n) + n) % n) * g + dy;
    const ueber = dx + b >= g || dy + h >= g ? 0.25 : 0; // Haarlinien zwischen Kacheln vermeiden
    ctx.drawImage(foto.bild, ux * s, uy * s, Math.max(0.5, b * s), Math.max(0.5, h * s), tx * g + dx, ty * g + dy, b + ueber, h + ueber);
  }

  /**
   * Phase 4.13: höherrangige Nachbar-Naturböden (auch diagonal) wachsen mit einer Rausch-Maske in diese Kachel hinein.
   * An der Kachelkante ist die Deckkraft 1 (kein Saum zum Nachbarn), nach innen franst sie unregelmäßig aus (Welt-Rauschen →
   * die Front läuft über Kachelgrenzen weiter). Gemalt wird der Nachbarboden in eine kleine Leinwand (#zeichneBoden mit art).
   */
  #weicheRaender(ctx, tx, ty) {
    const eigen = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    if (!(eigen in WEICHE_BOEDEN)) return;
    const arten = new Map();
    for (const [dx, dy] of ACHT) {
      const n = KACHELN[this.welt.kachelAn(tx + dx, ty + dy)]?.name;
      if (!(n in WEICHE_BOEDEN) || WEICHE_BOEDEN[n] <= WEICHE_BOEDEN[eigen]) continue;
      if (!arten.has(n)) arten.set(n, []);
      arten.get(n).push([dx, dy]);
    }
    if (!arten.size) return;
    const g = this.g;
    const s = ctx.getTransform().a || 1;
    const n = Math.max(4, Math.round(g * s));
    if (!this.randLeinwand || this.randLeinwand.width !== n) {
      this.randLeinwand = neuesCanvas(n, n);
      this.randCtx = this.randLeinwand.getContext('2d', { willReadFrequently: true });
    }
    const k = this.randCtx;
    for (const [art, richtungen] of [...arten].sort((a, b) => WEICHE_BOEDEN[a[0]] - WEICHE_BOEDEN[b[0]])) {
      const kanten = richtungen.filter(([dx, dy]) => dx === 0 || dy === 0);
      // Diagonale nur, wenn keine der beiden angrenzenden Kanten schon dieselbe Art ist (sonst deckt die Kante die Ecke ab)
      const ecken = richtungen.filter(([dx, dy]) => dx !== 0 && dy !== 0 && !kanten.some(([ex, ey]) => (ex === dx && ey === 0) || (ex === 0 && ey === dy)));
      k.setTransform(1, 0, 0, 1, 0, 0);
      k.clearRect(0, 0, n, n);
      k.setTransform(s, 0, 0, s, -tx * g * s, -ty * g * s);
      this.#zeichneBoden(k, tx, ty, art);
      k.setTransform(1, 0, 0, 1, 0, 0);
      const bild = k.getImageData(0, 0, n, n);
      const d = bild.data;
      for (let py = 0; py < n; py++) {
        const fy = (py + 0.5) / n;
        for (let px = 0; px < n; px++) {
          const fx = (px + 0.5) / n;
          let abstand = 2;
          for (const [dx, dy] of kanten) abstand = Math.min(abstand, dy === -1 ? fy : dy === 1 ? 1 - fy : dx === -1 ? fx : 1 - fx);
          for (const [dx, dy] of ecken) abstand = Math.min(abstand, Math.hypot(dx < 0 ? fx : 1 - fx, dy < 0 ? fy : 1 - fy));
          if (abstand >= UEBERGANG_TIEFE + 0.3) {
            d[(py * n + px) * 4 + 3] = 0;
            continue;
          }
          const wx = tx + fx;
          const wy = ty + fy;
          const rausch = wertRauschen(wx * 2.3, wy * 2.3) * 0.65 + wertRauschen(wx * 6.1 + 17, wy * 6.1 + 9) * 0.35;
          const t = (abstand + (rausch - 0.5) * 0.7 * Math.min(1, abstand * 4)) / UEBERGANG_TIEFE;
          let a = Math.max(0, Math.min(1, 1 - t));
          a = a * a * (3 - 2 * a);
          d[(py * n + px) * 4 + 3] *= a;
        }
      }
      k.putImageData(bild, 0, 0);
      ctx.drawImage(this.randLeinwand, 0, 0, n, n, tx * g, ty * g, g, g);
    }
  }

  #grasRand(ctx, tx, ty) {
    const name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    if (!GRAS_RAND_BOEDEN.has(name)) return;
    const istGras = (dx, dy) => KACHELN[this.welt.kachelAn(tx + dx, ty + dy)]?.name === 'gras';
    const g = this.g;
    const x = tx * g;
    const y = ty * g;
    const tiefe = 7;
    const seiten = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (istGras(dx, dy)) seiten.push([dx, dy]);
    for (const [dx, dy] of seiten) {
      // Verlauf von der Kante ins Kachelinnere
      const kx = dx < 0 ? x : dx > 0 ? x + g : 0;
      const ky = dy < 0 ? y : dy > 0 ? y + g : 0;
      const v = dx === 0 ? ctx.createLinearGradient(0, ky, 0, ky - dy * tiefe) : ctx.createLinearGradient(kx, 0, kx - dx * tiefe, 0);
      v.addColorStop(0, GRAS_RAND_FARBE(0.85));
      v.addColorStop(1, GRAS_RAND_FARBE(0));
      ctx.fillStyle = v;
      if (dx === 0) ctx.fillRect(x, dy < 0 ? y : y + g - tiefe, g + 0.25, tiefe);
      else ctx.fillRect(dx < 0 ? x : x + g - tiefe, y, tiefe, g + 0.25);
      // Büschel entlang der Kante (unterschiedlich weit hinein)
      const h = streuwert(tx * 17 + dx * 5 + 3, ty * 23 + dy * 7 + 1);
      for (let i = 0; i < 4; i++) {
        const entlang = ((i + 0.5) / 4) * g + (((h >> (i * 4)) % 9) - 4);
        const hinein = 2 + ((h >> (i * 3 + 13)) % 6);
        const r = 3 + ((h >> (i * 2 + 7)) % 4);
        const bx = dx === 0 ? x + entlang : kx - dx * hinein;
        const by = dx === 0 ? ky - dy * hinein : y + entlang;
        const b = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        b.addColorStop(0, GRAS_RAND_FARBE(0.75));
        b.addColorStop(1, GRAS_RAND_FARBE(0));
        ctx.fillStyle = b;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
    // Ecken: Rasen nur diagonal (keine der beiden Seiten ist Rasen) → kleiner runder Fleck in der Ecke
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (!istGras(dx, dy) || istGras(dx, 0) || istGras(0, dy)) continue;
      const ex = dx < 0 ? x : x + g;
      const ey = dy < 0 ? y : y + g;
      const b = ctx.createRadialGradient(ex, ey, 0, ex, ey, tiefe + 2);
      b.addColorStop(0, GRAS_RAND_FARBE(0.8));
      b.addColorStop(1, GRAS_RAND_FARBE(0));
      ctx.fillStyle = b;
      ctx.fillRect(dx < 0 ? x : x + g - tiefe - 2, dy < 0 ? y : y + g - tiefe - 2, tiefe + 2, tiefe + 2);
    }
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
  /**
   * Runde 37: sanfte, weltfeste Tönung (hell/dunkel) in 8-px-Blöcken aus Welt-Rauschen – Fläche statt Pünktchen/Quadrate.
   * @param stufe max. Deckkraft der Aufhellung/Abdunklung
   */
  #weicherTon(ctx, tx, ty, stufe) {
    const g = this.g;
    const blk = g / 4;
    for (let by = 0; by < 4; by++) {
      for (let bx = 0; bx < 4; bx++) {
        const wx = tx * g + bx * blk;
        const wy = ty * g + by * blk;
        const n = wertRauschen(wx * 0.011 + 5, wy * 0.011 + 9) * 0.75 + wertRauschen(wx * 0.04 + 31, wy * 0.04 + 2) * 0.25;
        ctx.fillStyle = n > 0.5 ? `rgba(255, 255, 255, ${((n - 0.5) * 2 * stufe).toFixed(3)})` : `rgba(0, 0, 0, ${((0.5 - n) * 2 * stufe).toFixed(3)})`;
        ctx.fillRect(wx, wy, blk + 0.25, blk + 0.25);
      }
    }
  }

  /**
   * Runde 37: Innenböden (Holz, Fliesen, Beton) als durchgehende Fläche statt Atlas-Quadraten.
   * Holz = Dielen in Weltkoordinaten (8 px hoch, versetzte Stöße alle 96 px), Fliesen/Beton = glatte Fläche mit sanfter Tönung.
   */
  #innenBoden(ctx, tx, ty, name) {
    const g = this.g;
    const x = tx * g;
    const y = ty * g;
    ctx.fillStyle = KACHEL_FARBEN[name];
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    if (name !== 'holz') {
      this.#weicherTon(ctx, tx, ty, name === 'beton' ? 0.1 : 0.06);
      return;
    }
    const hoch = g / 4;
    const LAENGE = 96;
    for (let r = 0; r < 4; r++) {
      const zeile = ty * 4 + r;
      const zy = y + r * hoch;
      const versatz = streuwert(zeile, 77) % LAENGE;
      // Dielenstücke dieser Zeile, die die Kachel berühren
      for (let k = Math.floor((x - versatz) / LAENGE); versatz + k * LAENGE < x + g; k++) {
        const von = Math.max(x, versatz + k * LAENGE);
        const bis = Math.min(x + g, versatz + (k + 1) * LAENGE);
        if (bis <= von) continue;
        const t = streuwert(zeile * 131 + 7, k + 1000) % 100;
        ctx.fillStyle = t < 50 ? `rgba(0, 0, 0, ${(t / 50 * 0.1).toFixed(3)})` : `rgba(255, 225, 180, ${((t - 50) / 50 * 0.1).toFixed(3)})`;
        ctx.fillRect(von, zy, bis - von + 0.25, hoch);
        // Stoß (senkrechte Fuge) am Stückanfang
        if (versatz + k * LAENGE >= x) {
          ctx.fillStyle = 'rgba(70, 40, 18, 0.35)';
          ctx.fillRect(versatz + k * LAENGE, zy, 1, hoch);
        }
      }
      ctx.fillStyle = 'rgba(70, 40, 18, 0.3)'; // Fuge zwischen den Dielenreihen
      ctx.fillRect(x, zy, g + 0.25, 1);
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
    const k = KACHELN[this.welt.kachelAn(tx, ty)];
    return !!k?.wand || k?.name === 'fenster';
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
