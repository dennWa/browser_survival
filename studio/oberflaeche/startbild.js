import { icon } from './icons.js';
import { esc } from './dialoge.js';

/**
 * Startbildschirm: Bereiche (Karten, Audio-Zentrale (Phase 2), Modell-Werkstatt (Phase 3)), zuletzt geöffnete Zonen,
 * Spielordner (änderbar) und KI-Verbindung. Zuletzt geöffnet: localStorage `browserSurvival.studio.zuletzt`.
 */
const ZULETZT = 'browserSurvival.studio.zuletzt';

export function merkeZuletzt(id) {
  try {
    const liste = JSON.parse(localStorage.getItem(ZULETZT) || '[]').filter((x) => x !== id);
    localStorage.setItem(ZULETZT, JSON.stringify([id, ...liste].slice(0, 6)));
  } catch {
    // egal
  }
}

function zuletzt() {
  try {
    return JSON.parse(localStorage.getItem(ZULETZT) || '[]');
  } catch {
    return [];
  }
}

export async function zeigeStartbild(studio) {
  const el = document.getElementById('startbild');
  const info = await studio.nativ.aufruf('projekt.info');
  const mcp = await studio.nativ.aufruf('mcp.info');
  const zonen = await studio.nativ.aufruf('projekt.zonen');
  const letzte = zuletzt().map((id) => zonen.find((z) => z.id === id)).filter(Boolean);
  el.innerHTML = `
    <div class="start">
      <div class="start-kopf"><div class="start-logo">${icon('zone', 26)}</div><div><div class="start-titel">Browser Survival Studio</div><div class="start-unter">Der Editor für Browser Survival · Spiel v${esc(info.version)}</div></div></div>
      <div class="start-karten">
        <button class="start-karte" data-start="karten">${icon('zone', 26)}<div class="start-karte-titel">Karten bearbeiten</div><div class="start-karte-text">Zonen in 3D und 2D bauen: Böden, Wände, Räume, Objekte, Loot, Spawnpunkte, Klänge, Übergänge – und direkt testen.</div></button>
        <button class="start-karte" data-start="audio">${icon('audio', 26)}<div class="start-karte-titel">Audio-Zentrale</div><div class="start-karte-text">Alle Sounds und Musik: schneiden, Ereignissen zuordnen, Pegel je Zone, Musik-Überblendung, Wetter-Mischpult wie im Spiel.</div></button>
        <button class="start-karte" data-start="werkstatt">${icon('modell', 26)}<div class="start-karte-titel">Modell-Werkstatt</div><div class="start-karte-text">Modelle so sehen wie im Spiel, Größe, Kollision und Grundfläche einstellen, einfärben, aus Grundkörpern zusammensetzen, animieren.</div></button>
      </div>
      <div class="start-unten">
        <div class="start-kasten"><div class="start-kasten-titel">Zuletzt geöffnet</div>${letzte.length ? letzte.map((z) => `<div class="liste-eintrag" data-zone="${esc(z.id)}">${icon('zone', 16)}<span>${esc(z.name)}</span><span class="neben">${z.breite} × ${z.hoehe}</span></div>`).join('') : '<div style="color:var(--text-3)">Noch nichts – öffne links eine Zone.</div>'}</div>
        <div class="start-kasten"><div class="start-kasten-titel">Spielordner</div><div class="start-pfad">${esc(info.wurzel)}</div><div style="display:flex;gap:8px"><button class="knopf" data-start="ordner">${icon('ordner', 14)} Ändern</button><button class="knopf flach" data-start="zeigen">Im Explorer zeigen</button></div>
          <div class="start-kasten-titel" style="margin-top:6px">KI-Verbindung (MCP)</div><div style="color:var(--text-2)">${mcp.aktiv ? `Bereit auf <span class="start-pfad">${esc(mcp.url)}</span>` : 'aus'}</div></div>
      </div>
    </div>`;
  el.classList.add('offen');
  return new Promise((fertig) => {
    el.onclick = async (e) => {
      const z = e.target.closest('[data-zone]');
      const s = e.target.closest('[data-start]')?.dataset.start;
      if (z) {
        el.classList.remove('offen');
        fertig(z.dataset.zone);
      } else if (s === 'karten') {
        el.classList.remove('offen');
        fertig(null);
      } else if (s === 'audio') {
        el.classList.remove('offen');
        fertig(null);
        studio.audio.oeffne().catch((f) => studio.hinweis(f.message, 'fehler'));
      } else if (s === 'werkstatt') {
        el.classList.remove('offen');
        fertig(null);
        studio.werkstatt.oeffne().catch((f) => studio.hinweis(f.message, 'fehler'));
      } else if (s === 'ordner') {
        try {
          const neu = await studio.nativ.aufruf('projekt.ordnerWaehlen');
          if (neu) location.reload();
        } catch (f) {
          studio.hinweis(f.message, 'fehler');
        }
      } else if (s === 'zeigen') studio.nativ.aufruf('projekt.ordnerZeigen');
    };
  });
}
