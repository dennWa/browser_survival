/**
 * Runde 24: Musik aus Radio/Plattenspieler (Bauwerke mit b.musik, server/spiel/systeme/musikSystem.js) – synchron für alle:
 * Position = (Server-Tick − startTick) × Tickdauer. Es spielt nur die NÄCHSTE Quelle in HOERWEITE; Lautstärke fällt mit dem Abstand,
 * von draußen in ein Haus hinein gedämpft. Solange Hausmusik läuft, pausiert die Zonen-Musik.
 *   ordner  → Datei client/musik/<pfad> über sound.spieleMusik (Musik-Regler gilt)
 *   youtube → unsichtbarer YouTube-Player (IFrame-API, nur bei Bedarf geladen); Lautstärke × Musik-/Gesamtregler von Hand
 */
const HOERWEITE = 720; // px
const DRAUSSEN_DAEMPFUNG = 0.4;

export class HausMusik {
  #aktuell = null; // { schluessel, spieler (sound.spieleMusik) | yt }
  #yt = null; // Promise auf window.YT
  constructor(sound, zonenMusik) {
    this.sound = sound;
    this.zonenMusik = zonenMusik;
    this.zone = null;
  }

  /** ~4×/s aus clientSpiel. */
  aktualisiere({ welt, x, y, tick, tickDauerS, zone }) {
    this.zone = zone;
    const g = welt.kachelGroesse;
    let beste = null;
    let bestAbstand = HOERWEITE;
    for (const b of welt.bauwerke.values()) {
      if (!b.musik) continue;
      const d = Math.hypot((b.tx + 0.5) * g - x, (b.ty + 0.5) * g - y);
      if (d < bestAbstand) {
        beste = b;
        bestAbstand = d;
      }
    }
    const schluessel = beste ? `${beste.id}|${beste.musik.quelle}|${beste.musik.wert}|${beste.musik.startTick}` : null;
    if (schluessel !== (this.#aktuell?.schluessel ?? null)) {
      this.stoppen();
      if (beste) this.#starte(beste, schluessel, Math.max(0, (tick - beste.musik.startTick) * tickDauerS));
    }
    if (!this.#aktuell) return;
    const draussen = !welt.istInnen(x, y) && welt.istInnen((beste.tx + 0.5) * g, (beste.ty + 0.5) * g);
    const pegel = Math.max(0, 1 - bestAbstand / HOERWEITE) ** 1.5 * (draussen ? DRAUSSEN_DAEMPFUNG : 1);
    this.#aktuell.pegel = pegel;
    this.#aktuell.spieler?.lautstaerke(pegel);
    this.#ytLautstaerke();
  }

  #starte(b, schluessel, ab) {
    this.zonenMusik?.stoppen();
    if (b.musik.quelle === 'ordner') {
      const spieler = this.sound?.spieleMusik(new URL(`../musik/${b.musik.wert}`, import.meta.url).href, { fade: 1.5, schleife: true, ab });
      this.#aktuell = { schluessel, spieler, pegel: 0 };
    } else if (b.musik.quelle === 'youtube') {
      this.#aktuell = { schluessel, yt: null, pegel: 0 };
      const eintrag = this.#aktuell;
      this.#ladeYouTube()
        .then((YT) => {
          if (this.#aktuell !== eintrag) return;
          const ort = document.createElement('div');
          ort.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:120px;pointer-events:none';
          const halter = document.createElement('div');
          ort.append(halter);
          document.body.append(ort);
          eintrag.ort = ort;
          eintrag.yt = new YT.Player(halter, {
            videoId: b.musik.wert,
            playerVars: { autoplay: 1, controls: 0, start: Math.floor(ab), loop: 1, playlist: b.musik.wert, playsinline: 1 },
            events: { onReady: (e) => ((eintrag.bereit = true), e.target.playVideo(), this.#ytLautstaerke()) },
          });
        })
        .catch(() => {});
    }
  }

  #ytLautstaerke() {
    const a = this.#aktuell;
    if (!a?.yt || !a.bereit) return;
    const l = this.sound?.lautstaerken ?? { gesamt: 0.7, musik: 0.5 };
    const wert = this.sound?.stumm ? 0 : Math.round(a.pegel * l.gesamt * l.musik * 100);
    if (wert !== a.ytWert) {
      a.ytWert = wert;
      a.yt.setVolume?.(wert);
    }
  }

  #ladeYouTube() {
    if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
    this.#yt ??= new Promise((ok, fehler) => {
      const vorher = globalThis.onYouTubeIframeAPIReady;
      globalThis.onYouTubeIframeAPIReady = () => {
        vorher?.();
        ok(globalThis.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => fehler(new Error('YouTube nicht erreichbar'));
      document.head.append(s);
    });
    return this.#yt;
  }

  stoppen() {
    const a = this.#aktuell;
    if (!a) return;
    this.#aktuell = null;
    a.spieler?.stoppen(1);
    try {
      a.yt?.destroy?.();
    } catch {}
    a.ort?.remove();
    if (this.zone) this.zonenMusik?.setzeZone(this.zone); // Zonen-Musik wieder an
  }
}

/** YouTube-Video-ID aus Link oder ID (youtu.be/…, watch?v=…, shorts/…, embed/…). null = ungültig */
export function youtubeId(text) {
  const t = String(text ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
