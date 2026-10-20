import { ZEITLUPE, SCHRITTE, tickDauerBei, debugSchnappschuss, naechsterZombie, zombieInfo } from '../../server/spiel/debugAnsicht.js';

/**
 * Debug-Testlauf (Map-Editor 2.0, Schritt 8.1) – NUR im Editor-Test (`client/?editorTest=1`), nie online.
 * Der Lokal-Server läuft im selben Tab → das Panel liest die Server-Welt direkt (server/spiel/debugAnsicht.js) und
 * steuert seinen Taktgeber:
 *   Zeitlupe 0,1× … 1×  Server-Taktgeber + Client-Schleife bekommen dieselbe längere Tick-Dauer (gleiche Simulation, langsamer)
 *   ⏸ Pause             Taktgeber stoppt, Client sendet keine Eingaben (Zeichnen läuft weiter); +1 / +10 Ticks einzeln
 *   Overlays            Zombie-Pfade (A*), Ziele + Bemerk-/Verlier-/Hörradius, Spawnpunkte mit Respawn-Timern,
 *                       Loot-Punkte (belegt / Nachschub), Klänge (Audio-Zonen), Übergänge
 *   🔍 Info             nächster Klick/Tipp auf die Karte wählt einen Zombie → Info-Karte (live), statt zu schießen
 * Einstellungen (Overlays, Zeitlupe) bleiben im Tab (sessionStorage `browserSurvival.debugLauf`).
 */
const SPEICHER = 'browserSurvival.debugLauf';
export const OVERLAYS = Object.freeze([
  { id: 'pfade', name: 'Pfade (A*)' },
  { id: 'ziele', name: 'Ziele/Sicht' },
  { id: 'spawns', name: 'Spawns' },
  { id: 'loot', name: 'Loot' },
  { id: 'klaenge', name: 'Klänge' },
  { id: 'uebergaenge', name: 'Übergänge' },
]);

export function starteDebugLauf({ dokument = document, spiel, server, leinwand }) {
  const zustand = { faktor: 1, pausiert: false, offen: true, overlays: { pfade: true, ziele: true, spawns: true, loot: false, klaenge: false, uebergaenge: true }, ...lies() };
  let letztesSpiel = null;
  let schnapp = null;
  let schnappZeit = 0;
  let gewaehlt = null; // Zombie-ID
  let infoModus = false;

  const panel = dokument.createElement('div');
  panel.id = 'debug-lauf';
  panel.innerHTML = `
    <button type="button" class="dl-kopf" data-d="offen">🐞 Debug</button>
    <div class="dl-inhalt">
      <div class="dl-zeile dl-tempo">${ZEITLUPE.map((f) => `<button type="button" data-tempo="${f}">${String(f).replace('.', ',')}×</button>`).join('')}</div>
      <div class="dl-zeile"><button type="button" data-d="pause" class="dl-gross">⏸</button>${SCHRITTE.map((n) => `<button type="button" data-schritt="${n}" title="${n} Tick(s) weiter">+${n}</button>`).join('')}<span class="dl-tick"></span></div>
      <div class="dl-zeile dl-ov">${OVERLAYS.map((o) => `<label><input type="checkbox" data-ov="${o.id}"> ${o.name}</label>`).join('')}</div>
      <div class="dl-zeile"><button type="button" data-d="info">🔍 Zombie-Info</button></div>
      <div class="dl-karte" hidden></div>
    </div>`;
  const stil = dokument.createElement('style');
  stil.textContent = `
    #debug-lauf{position:fixed;top:64px;left:8px;z-index:61;width:230px;background:rgba(20,24,30,.92);border:1px solid #c58af9;border-radius:8px;color:#e4e7ec;font:12px system-ui;pointer-events:auto}
    #debug-lauf button{background:#2a2f37;color:#e4e7ec;border:1px solid #444b55;border-radius:6px;min-height:32px;min-width:36px;padding:0 6px;font:600 12px system-ui;cursor:pointer}
    #debug-lauf button.aktiv{background:#7b3fb5;border-color:#c58af9}
    #debug-lauf .dl-kopf{width:100%;border:0;background:transparent;text-align:left}
    #debug-lauf .dl-zeile{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:3px 6px}
    #debug-lauf .dl-gross{font-size:16px}
    #debug-lauf .dl-tick{margin-left:auto;color:#9aa3ad;font-variant-numeric:tabular-nums}
    #debug-lauf .dl-ov label{display:flex;flex-direction:row;justify-content:flex-start;gap:5px;align-items:center;width:calc(50% - 4px);min-height:26px;margin:0;color:#e4e7ec;font:12px system-ui}
    #debug-lauf .dl-ov input{width:auto;height:auto;margin:0;flex:none}
    #debug-lauf .dl-karte{margin:4px 6px 6px;padding:6px;background:#11151a;border-radius:6px;line-height:1.45;white-space:pre-line}
    #debug-lauf.zu .dl-inhalt{display:none}
    #debug-overlay{position:fixed;left:0;top:0;pointer-events:none;z-index:5}`;
  const overlay = dokument.createElement('canvas');
  overlay.id = 'debug-overlay';
  dokument.head.append(stil);
  dokument.body.append(overlay, panel);
  const karte = panel.querySelector('.dl-karte');

  const anwenden = () => {
    const s = server();
    const ms = tickDauerBei(zustand.faktor);
    if (s?.taktgeber) {
      s.taktgeber.setzeTickDauer(ms);
      if (zustand.pausiert) s.taktgeber.stoppen();
      else if (!s.taktgeber.laeuft) s.taktgeber.starten();
    }
    const sp = spiel();
    if (sp?.schleife) {
      sp.schleife.tickDauerMs = ms;
      sp.schleife.pausiert = zustand.pausiert;
    }
    zeigeKnoepfe();
    schreibe(zustand);
  };

  const zeigeKnoepfe = () => {
    panel.classList.toggle('zu', !zustand.offen);
    for (const b of panel.querySelectorAll('[data-tempo]')) b.classList.toggle('aktiv', Number(b.dataset.tempo) === zustand.faktor);
    const p = panel.querySelector('[data-d="pause"]');
    p.textContent = zustand.pausiert ? '▶' : '⏸';
    p.title = zustand.pausiert ? 'Weiter' : 'Pause';
    p.classList.toggle('aktiv', zustand.pausiert);
    for (const b of panel.querySelectorAll('[data-schritt]')) b.disabled = !zustand.pausiert;
    for (const c of panel.querySelectorAll('[data-ov]')) c.checked = !!zustand.overlays[c.dataset.ov];
    panel.querySelector('[data-d="info"]').classList.toggle('aktiv', infoModus);
  };

  const schritt = (n) => {
    const s = server();
    if (!s || !zustand.pausiert) return;
    for (let i = 0; i < n; i++) s.tickAusfuehren();
    schnappZeit = 0;
  };

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tempo) zustand.faktor = Number(b.dataset.tempo);
    else if (b.dataset.schritt) return schritt(Number(b.dataset.schritt));
    else if (b.dataset.d === 'pause') zustand.pausiert = !zustand.pausiert;
    else if (b.dataset.d === 'offen') zustand.offen = !zustand.offen;
    else if (b.dataset.d === 'info') {
      infoModus = !infoModus;
      if (!infoModus) {
        gewaehlt = null;
        karte.hidden = true;
      }
    }
    b.blur(); // Leertaste/Tasten gehen weiter ans Spiel
    anwenden();
  });
  panel.addEventListener('change', (e) => {
    const c = e.target.closest('[data-ov]');
    if (!c) return;
    zustand.overlays[c.dataset.ov] = c.checked;
    schreibe(zustand);
  });
  // Info-Modus: Klick/Tipp auf die Karte wählt einen Zombie (und schießt nicht)
  const auswaehlen = (e) => {
    if (!infoModus || !schnapp) return;
    // Capture-Listener am Ziel laufen vor den Spiel-Listenern (eingabe.js, touchSteuerung.js) → die sehen den Klick nicht
    e.stopImmediatePropagation();
    e.preventDefault();
    const sp = spiel();
    const r = leinwand.getBoundingClientRect();
    const p = sp?.renderer?.kamera?.bildschirmZuBoden(e.clientX - r.left, e.clientY - r.top);
    const z = p ? naechsterZombie(schnapp, p.x, p.y, 40) : null;
    gewaehlt = z?.id ?? null;
    karte.hidden = !z;
    if (!z) karte.textContent = '';
    else if (e.type === 'pointerdown') schnappZeit = 0;
  };
  for (const ev of ['pointerdown', 'mousedown', 'click']) leinwand.addEventListener(ev, auswaehlen, { capture: true });

  const zeichne = (jetzt) => {
    requestAnimationFrame(zeichne);
    const sp = spiel();
    if (sp !== letztesSpiel) {
      letztesSpiel = sp; // Zonenwechsel = neues ClientSpiel → Zeitlupe/Pause wieder setzen
      if (sp) anwenden();
    }
    const s = server();
    const welt = sp && s?.weltVon?.(sp.benutzername);
    if (welt && jetzt - schnappZeit > 100) {
      schnapp = debugSchnappschuss(welt, { spielerId: sp.eigeneId });
      schnappZeit = jetzt;
      panel.querySelector('.dl-tick').textContent = `Tick ${schnapp.tick}`;
      const z = gewaehlt !== null ? schnapp.zombies.find((x) => x.id === gewaehlt) : null;
      if (gewaehlt !== null && !z) {
        karte.textContent = `🧟 Zombie #${gewaehlt} ist weg (tot oder außer Zone)`;
        gewaehlt = null;
      } else if (z) karte.textContent = zombieInfo(z, welt.welt?.kachelGroesse ?? 32).join('\n');
    }
    maleOverlay(overlay, leinwand, sp?.renderer?.kamera, welt ? schnapp : null, zustand.overlays, gewaehlt);
  };
  requestAnimationFrame(zeichne);
  anwenden();
  return { zustand, anwenden, schritt, waehle: (id) => ((gewaehlt = id), (karte.hidden = false)), get schnappschuss() { return schnapp; }, panel };
}

// --- Zeichnen ----------------------------------------------------------------------------------
function maleOverlay(c, leinwand, kamera, s, ov, gewaehlt) {
  const r = leinwand.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    c.style.width = `${r.width}px`;
    c.style.height = `${r.height}px`;
  }
  c.style.left = `${r.left}px`;
  c.style.top = `${r.top}px`;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  if (!s || !kamera) return;
  const P = (x, y, h = 0) => kamera.weltZuBildschirm(x, y, h);
  const drin = (p) => p.x > -200 && p.y > -200 && p.x < r.width + 200 && p.y < r.height + 200;
  // Bodenkreis als Polygon (perspektivisch korrekt)
  const kreis = (x, y, rad, farbe, strich = []) => {
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const w = (i / 32) * Math.PI * 2;
      const p = P(x + Math.cos(w) * rad, y + Math.sin(w) * rad);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.setLineDash(strich);
    ctx.strokeStyle = farbe;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const rechteck = (x, y, b, h, farbe, fuell) => {
    const e = [P(x, y), P(x + b, y), P(x + b, y + h), P(x, y + h)];
    ctx.beginPath();
    e.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fuell) {
      ctx.fillStyle = fuell;
      ctx.fill();
    }
    ctx.strokeStyle = farbe;
    ctx.stroke();
  };
  const text = (t, x, y, farbe = '#fff') => {
    ctx.font = '600 11px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = farbe;
    ctx.fillText(t, x, y);
    ctx.lineWidth = 1.5;
  };
  ctx.lineWidth = 1.5;

  if (ov.uebergaenge) for (const u of s.uebergaenge) {
    rechteck(u.x, u.y, u.b, u.h, '#2b8cff', 'rgba(43,140,255,.18)');
    const m = P(u.x + u.b / 2, u.y + u.h / 2);
    if (drin(m)) text(`→ ${u.name}`, m.x, m.y, '#8cc4ff');
  }
  if (ov.klaenge) for (const k of s.klaenge) {
    if (k.art === 'punkt') {
      kreis(k.x, k.y, k.innen, 'rgba(120,220,255,.9)');
      kreis(k.x, k.y, k.aussen, 'rgba(120,220,255,.6)', [5, 4]);
      const m = P(k.x, k.y);
      if (drin(m)) text(`🔊 ${k.name}`, m.x, m.y, '#a8e8ff');
    } else {
      rechteck(k.x, k.y, k.b, k.h, 'rgba(120,220,255,.8)', 'rgba(120,220,255,.08)');
      const m = P(k.x + k.b / 2, k.y + k.h / 2);
      if (drin(m)) text(`🔊 ${k.name}`, m.x, m.y, '#a8e8ff');
    }
  }
  if (ov.loot) for (const l of s.loot) {
    const p = P(l.x, l.y);
    if (!drin(p)) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = l.belegt ? '#ffd23f' : 'rgba(255,210,63,.25)';
    ctx.fill();
    if (!l.belegt && l.rest > 0) text(`${Math.ceil(l.rest)} s`, p.x, p.y - 7, '#ffe48a');
  }
  if (ov.spawns) for (const sp of s.spawns) {
    const p = P(sp.x, sp.y);
    if (!drin(p)) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = sp.horde ? 'rgba(138,43,226,.8)' : 'rgba(209,56,56,.8)';
    ctx.fill();
    const rest = sp.respawns.length ? ` · ⟳ ${sp.respawns.map((t) => `${Math.ceil(t)}s`).join(' ')}` : '';
    text(`${sp.horde ? '🌙' : 'Z'} ${sp.lebend}/${sp.plaetze}${rest}`, p.x, p.y - 10, '#ffb3b3');
  }
  for (const z of s.zombies) {
    const p = P(z.x, z.y);
    const ausgewaehlt = z.id === gewaehlt;
    if (!drin(p) && !ausgewaehlt) continue;
    if ((ov.pfade || ausgewaehlt) && z.pfad?.length) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (const w of z.pfad) {
        const q = P(w.x, w.y);
        ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = ausgewaehlt ? '#ffe14d' : 'rgba(255,225,77,.75)';
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const w of z.pfad) {
        const q = P(w.x, w.y);
        ctx.fillStyle = 'rgba(255,225,77,.9)';
        ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
    }
    if (ov.ziele || ausgewaehlt) {
      if (z.ziel) {
        const q = P(z.ziel.x, z.ziel.y);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = 'rgba(255,70,70,.95)';
        ctx.stroke();
      } else if (z.wanderZiel) {
        const q = P(z.wanderZiel.x, z.wanderZiel.y);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = 'rgba(160,160,160,.6)';
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ausgewaehlt || z.ziel) {
        kreis(z.x, z.y, s.radien.bemerk, 'rgba(255,120,120,.75)');
        if (ausgewaehlt) {
          kreis(z.x, z.y, s.radien.verlier, 'rgba(255,120,120,.35)', [6, 6]);
          kreis(z.x, z.y, s.radien.hoer, 'rgba(255,200,120,.35)', [2, 6]);
        }
      } else kreis(z.x, z.y, s.radien.bemerk, 'rgba(255,120,120,.22)');
    }
    if (ausgewaehlt) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }
  }
}

function lies() {
  try {
    return JSON.parse(sessionStorage.getItem(SPEICHER) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function schreibe(z) {
  try {
    sessionStorage.setItem(SPEICHER, JSON.stringify({ faktor: z.faktor, offen: z.offen, overlays: z.overlays }));
  } catch {
    /* gesperrter Speicher */
  }
}
