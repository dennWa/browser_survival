import { nachbarn, vorschlaegeFuerPaar, vorschlagOps, layoutAusUebergaengen, GEGENSEITE } from '../kern/zonenVerbund.js';
import { validiere } from '../kern/validierung.js';
import { kachelBild } from './zeichner2d.js';
import { dialog, esc } from './dialoge.js';

/**
 * Zonen verbinden (Phase 7): Reiter „🗺 Zonen“ (linke Seitenleiste) mit Weltkarte aller Zonen des Projekts (ziehen = anordnen, Klick = öffnen),
 * Nachbarn, Übergänge als Linien, Vorschläge für Übergänge an gemeinsamen Kanten, Prüfung aller Zonen.
 * Die Anordnung (zustand.layout) liegt im Editor-Speicher (meta/layout), nicht in den Karten.
 * Außerdem: Nachbarzonen am Rand der Fläche anzeigen (zeichner.nachbarn).
 */
export function zonenUi({ zustand, panel, aktionen, befehle, layout, zeichner, projektZonen }) {
  const REITER = '🗺 Zonen';
  const zonenMap = () => new Map([...zustand.zonen].map(([id, e]) => [id, e.karte]));

  const aktualisiereNachbarn = () => {
    const id = zustand.aktivId;
    const p = zustand.layout[id];
    zeichner.nachbarn = !p ? [] : nachbarn(zonenMap(), zustand.layout).filter((n) => n.a === id || n.b === id).map((n) => {
      const andere = n.a === id ? n.b : n.a;
      return { karte: zustand.zonen.get(andere).karte, dx: zustand.layout[andere].x - p.x, dy: zustand.layout[andere].y - p.y };
    });
    zeichner.anfordern();
  };
  zustand.bei('zone', aktualisiereNachbarn);
  zustand.bei('karte', (ops) => ops.some((o) => o.s === 'raster') && aktualisiereNachbarn());

  const layoutGeaendert = () => {
    zustand.speicher.setze('meta', 'layout', zustand.layout);
    aktualisiereNachbarn();
    if (panel.aktiv === REITER) panel.zeichne();
  };

  aktionen.zonen = () => layout.zeigeReiter('links', REITER);
  aktionen.vorschlaege = () => vorschlagen();

  async function vorschlagen() {
    const zonen = zonenMap();
    const id = zustand.aktivId;
    const paare = nachbarn(zonen, zustand.layout).filter((n) => n.a === id || n.b === id);
    if (!paare.length) {
      aktionen.zonen();
      return dialog({ titel: 'Keine Nachbarn', html: '<p>Die aktive Zone grenzt an keine andere Zone. Im Reiter <b>🗺 Zonen</b> die Zonen auf der Weltkarte Kante an Kante schieben (oder „Aus Übergängen anordnen“).</p>' });
    }
    const liste = paare.flatMap((paar) => vorschlaegeFuerPaar(zonen, zustand.layout, paar).map((v) => ({ paar, v })));
    if (!liste.length) return dialog({ titel: 'Keine neuen Vorschläge', html: `<p>An den gemeinsamen Kanten (${paare.map((p) => `${esc(p.a)} ↔ ${esc(p.b)}`).join(', ')}) gibt es schon Übergänge, oder keine Stelle ist auf beiden Seiten begehbar.</p>` });
    const html = `<p>Gemeinsame Kanten gefunden. Vorgeschlagen werden Übergänge auf Wegen (sonst eine Stelle in der Mitte), jeweils mit Rückweg und Ankunftspunkt 3 Kacheln landeinwärts:</p>${liste
      .map(({ paar, v }, i) => `<label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" name="v${i}" checked /><span>${esc(paar.a)} (${paar.kante.seite}, x ${v.a.rechteck.x} y ${v.a.rechteck.y}, ${v.laenge} breit) ⇄ ${esc(paar.b)} (${GEGENSEITE[paar.kante.seite]}, x ${v.b.rechteck.x} y ${v.b.rechteck.y})</span></label>`)
      .join('')}`;
    const gewaehlt = await dialog({ titel: '💡 Übergänge vorschlagen', html, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Übernehmen', art: 'akzent', wert: (b) => liste.filter((_, i) => b.querySelector(`[name="v${i}"]`).checked) }] });
    if (!gewaehlt?.length) return;
    for (const { paar } of gewaehlt) {
      // jeweils frisch berechnen (IDs/Ankunftsnamen hängen vom aktuellen Stand ab)
      const v = vorschlaegeFuerPaar(zonen, zustand.layout, paar).find((x) => gewaehlt.some((g) => g.paar === paar && g.v.a.rechteck.x === x.a.rechteck.x && g.v.a.rechteck.y === x.a.rechteck.y));
      if (!v) continue;
      const { opsA, opsB } = vorschlagOps(zonen, paar, v);
      zustand.ausfuehren(`Übergang nach ${paar.b}`, opsA, zonen.get(paar.a));
      zustand.ausfuehren(`Übergang nach ${paar.a}`, opsB, zonen.get(paar.b));
    }
    await zustand.speichereAlle();
    zustand.meldung(`${gewaehlt.length} Übergänge (mit Rückweg + Ankunft) angelegt`, 'ok');
  }

  panel.registriere(REITER, () => {
    const el = panel.el;
    const zonen = zonenMap();
    el.innerHTML = '<p class="leise">Weltkarte: Zone ziehen = anordnen (Kante an Kante = Nachbarn), Klick = öffnen. Blaue Linien = Übergänge.</p>';
    const leinwand = document.createElement('canvas');
    leinwand.style.cssText = 'width:100%;height:240px;background:#0d0f12;border-radius:6px;touch-action:none;cursor:grab';
    el.append(leinwand);
    zeichneWeltkarte(leinwand, zonen);
    const reihe = document.createElement('div');
    reihe.className = 'knopfreihe';
    const knopf = (text, f, titel = '') => {
      const b = Object.assign(document.createElement('button'), { textContent: text, title: titel });
      b.addEventListener('click', f);
      reihe.append(b);
    };
    knopf('🔗 Aus Übergängen anordnen', () => {
      if (!zustand.aktivId) return;
      // relativ zur aktuellen Position der aktiven Zone (die bleibt liegen)
      const basis = zustand.layout[zustand.aktivId] ?? { x: 0, y: 0 };
      for (const [id, p] of Object.entries(layoutAusUebergaengen(zonen, zustand.aktivId))) zustand.layout[id] = { x: p.x + basis.x, y: p.y + basis.y };
      layoutGeaendert();
    }, 'legt Nachbarzonen so, dass Übergang und Rückweg zusammenpassen');
    knopf('💡 Übergänge vorschlagen', () => vorschlagen());
    knopf('➕ Zone öffnen', () => befehle.fuehreAus('datei.oeffnen'));
    el.append(reihe);
    // Liste + Prüfung
    const alle = projektZonen();
    const ul = document.createElement('ul');
    ul.className = 'liste';
    const paare = nachbarn(zonen, zustand.layout);
    for (const [id, k] of zonen) {
      const probleme = validiere(k, { zonen: alle, mitErreichbarkeit: false });
      const f = probleme.filter((p) => p.schwere === 'fehler').length;
      const nb = paare.filter((p) => p.a === id || p.b === id).map((p) => (p.a === id ? `${p.b} (${p.kante.seite})` : `${p.a} (${GEGENSEITE[p.kante.seite]})`));
      const ziele = [...new Set([...k.s('uebergaenge').values()].map((u) => u.ziel))];
      const li = document.createElement('li');
      li.innerHTML = `<b>${esc(k.name)}</b> (${esc(id)}, ${k.breite}×${k.hoehe}) ${f ? `⛔ ${f}` : '✓'}<br><span class="leise">Nachbarn: ${nb.map(esc).join(', ') || '–'} · Übergänge nach: ${ziele.map(esc).join(', ') || '–'}</span>`;
      li.addEventListener('click', () => {
        zustand.aktiviere(id);
        zeichner.einpassen();
      });
      const weg = Object.assign(document.createElement('button'), { textContent: '🗄', title: 'Archivieren oder löschen', className: 'gefahr' });
      weg.style.float = 'right';
      weg.dataset.archivieren = id;
      weg.addEventListener('click', (e) => {
        e.stopPropagation();
        aktionen.zoneEntfernen?.(id);
      });
      li.prepend(weg);
      ul.append(li);
    }
    el.append(ul);
    // Archiv (Schritt 6.1): archivierte Zonen zurückholen oder endgültig löschen (mit Sicherung)
    const archivEl = document.createElement('div');
    el.append(archivEl);
    zustand.archiv().then((archiv) => {
      const eintraege = Object.entries(archiv);
      archivEl.innerHTML = `<h4>🗄 Archiv <span class="leise">${eintraege.length}</span></h4>${eintraege.length ? `<ul class="zonen-liste ablage-liste">${eintraege.map(([id, a]) => `<li data-archiv="${esc(id)}"><span class="name">${esc(a.name)}<span class="leise klein"> ${esc(id)} · ${a.archiviert ? new Date(a.archiviert).toLocaleDateString('de-DE') : ''}</span></span><button type="button" data-a="zurueck" class="akzent" title="wieder ins Projekt">♻ Zurück</button><button type="button" data-a="loeschen" class="gefahr" title="endgültig löschen (Sicherung wird geladen)">🗑</button></li>`).join('')}</ul>` : '<p class="leise">leer – 🗄 an einer Zone archiviert sie (statt sie zu löschen)</p>'}`;
      archivEl.querySelectorAll('[data-archiv] button').forEach((b) => b.addEventListener('click', () => (b.dataset.a === 'zurueck' ? aktionen.archivZurueck?.(b.closest('[data-archiv]').dataset.archiv) : aktionen.archivLoeschen?.(b.closest('[data-archiv]').dataset.archiv))));
    });
  }, { gruppe: '🗺 Projekt', ereignisse: ['zone'], ohneKarte: true });

  function zeichneWeltkarte(leinwand, zonen) {
    const dpr = window.devicePixelRatio || 1;
    const b = leinwand.clientWidth || 280;
    const h = 240;
    leinwand.width = b * dpr;
    leinwand.height = h * dpr;
    const ctx = leinwand.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ids = [...zonen.keys()].filter((id) => zustand.layout[id]);
    if (!ids.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const id of ids) {
      const p = zustand.layout[id];
      const k = zonen.get(id);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + k.breite);
      y1 = Math.max(y1, p.y + k.hoehe);
    }
    const m = Math.min((b - 20) / (x1 - x0), (h - 20) / (y1 - y0));
    const zu = (x, y) => ({ x: 10 + (x - x0) * m, y: 10 + (y - y0) * m });
    const rechteck = (id) => {
      const p = zu(zustand.layout[id].x, zustand.layout[id].y);
      const k = zonen.get(id);
      return { ...p, b: k.breite * m, h: k.hoehe * m };
    };
    const male = () => {
      ctx.clearRect(0, 0, b, h);
      for (const id of ids) {
        const r = rechteck(id);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(kachelBild(zonen.get(id)), r.x, r.y, r.b, r.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = id === zustand.aktivId ? '#4caf50' : '#ffffffaa';
        ctx.lineWidth = id === zustand.aktivId ? 3 : 1;
        ctx.strokeRect(r.x, r.y, r.b, r.h);
        ctx.font = '600 11px system-ui';
        ctx.fillStyle = '#fff';
        ctx.fillText(zonen.get(id).name, r.x + 4, r.y + 13);
      }
      // Übergänge: Linie von der Übergangsmitte zur Ankunft in der Zielzone
      ctx.strokeStyle = '#2b8cff';
      ctx.lineWidth = 2;
      for (const id of ids) {
        const p = zustand.layout[id];
        for (const u of zonen.get(id).s('uebergaenge').values()) {
          const z = zonen.get(u.ziel);
          const pz = zustand.layout[u.ziel];
          const a = zu(p.x + u.x + u.b / 2, p.y + u.y + u.h / 2);
          const ank = z?.s('ankuenfte').get(u.ankunft);
          if (!z || !pz || !ank) continue;
          const e = zu(pz.x + ank.x + 0.5, pz.y + ank.y + 0.5);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#2b8cff';
          ctx.fill();
        }
      }
    };
    male();
    // Ziehen = anordnen, Klick = öffnen
    let ziehen = null;
    leinwand.addEventListener('pointerdown', (e) => {
      const r = leinwand.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const id = [...ids].reverse().find((i) => {
        const q = rechteck(i);
        return px >= q.x && px <= q.x + q.b && py >= q.y && py <= q.y + q.h;
      });
      if (!id) return;
      leinwand.setPointerCapture(e.pointerId);
      ziehen = { id, px, py, start: { ...zustand.layout[id] }, bewegt: false };
    });
    leinwand.addEventListener('pointermove', (e) => {
      if (!ziehen) return;
      const r = leinwand.getBoundingClientRect();
      const dx = Math.round((e.clientX - r.left - ziehen.px) / m);
      const dy = Math.round((e.clientY - r.top - ziehen.py) / m);
      if (Math.abs(dx) + Math.abs(dy) > 0) ziehen.bewegt = true;
      zustand.layout[ziehen.id] = einrasten(ziehen.id, { x: ziehen.start.x + dx, y: ziehen.start.y + dy }, zonen, m);
      male();
    });
    leinwand.addEventListener('pointerup', () => {
      if (!ziehen) return;
      const { id, bewegt } = ziehen;
      ziehen = null;
      if (bewegt) layoutGeaendert();
      else if (id !== zustand.aktivId) {
        zustand.aktiviere(id);
        zeichner.einpassen();
      }
    });
  }

  /** Beim Ziehen an Kanten anderer Zonen einrasten (innerhalb von 6 Bildpunkten) */
  function einrasten(id, p, zonen, m) {
    const k = zonen.get(id);
    const fang = 6 / m;
    let { x, y } = p;
    for (const [anderer, q] of Object.entries(zustand.layout)) {
      const o = zonen.get(anderer);
      if (anderer === id || !o) continue;
      for (const [kandidat, ziel] of [[x, q.x + o.breite], [x + k.breite, q.x], [x, q.x]]) if (Math.abs(kandidat - ziel) < fang) x += ziel - kandidat;
      for (const [kandidat, ziel] of [[y, q.y + o.hoehe], [y + k.hoehe, q.y], [y, q.y]]) if (Math.abs(kandidat - ziel) < fang) y += ziel - kandidat;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  return { aktualisiereNachbarn };
}
