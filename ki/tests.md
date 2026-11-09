# Tests · Prüf-Werkzeuge · Browser-Checks
> Lesen bei: Tests schreiben/ausführen, etwas im echten Spiel ansehen/messen, Rauchtests.

## Befehle
- `npm run t` = alle Tests, knapp (1 Zeile bei Erfolg, sonst nur Fehler) · `npm run t -- runde45 zonen` = einzelne Dateien (Kurzname). `npm test` nur, wenn TAP-Ausgabe nötig (≈3.700 Zeilen!).
- `npm run ansicht -- [--zone id] [--tp tx,ty] [--zeit h] [--sitzen] [--js "code"] [--kamera spiel,seite,vorn,hinten,oben,nah,weit]` → PNGs in `werkzeuge/test/ausgabe/ansicht/` (mit Read ansehen) + Konsolenfehler. `--js` hat `bs, spiel, welt (Server-Zone), ich (Server-Spieler), figur (Renderer-Figur), THREE`; Rückgabe wird ausgegeben. Beispiele:
  - Zittern messen: `--js "const q=[];for(let i=0;i<20;i++){await new Promise(r=>requestAnimationFrame(r));q.push(figur.knochen.rechts[2].getWorldQuaternion(new THREE.Quaternion()))}let m=0;for(let i=1;i<q.length;i++)m=Math.max(m,q[i].angleTo(q[i-1])*57.3);return m"`
  - Zustand setzen: `--js "bs.wetter('gewitter'); bs.gib('pistole',1); ich.leben=20"`
- Rauchtests (Playwright, ganze Abläufe): `npm run rauchtest [-- --online]` · `rauchtest:r23|r24 [-- --phase N]` · `rauchtest:editor [-- --schnell]` · `rauchtest:studio` (Linux `xvfb-run -a`) · Sonderfälle `node werkzeuge/test/qualitaetswechsel.mjs` (Schwarzbild), `bauGroesse.mjs`. Menü-Helfer `werkzeuge/test/menueHelfer.mjs`. Mehrspieler mit 2 Browsern: `node werkzeuge/test/rauchtestFunk.mjs` (Fake-Mikro, Nähe + Funk über Zonen) · `node werkzeuge/test/rauchtestHosten.mjs` (Host im Tab, Gast per `?beitreten=`, PvP, Kick; braucht Internet für den PeerJS-Vermittler).
- Code finden statt lesen: `npm run ki:gliederung -- <datei|ordner>` · `-- --wo <name>` · `-- --ohne-konst <datei>`.

## Tests schreiben
- `node:test` + `assert/strict`, Dateien `tests/<thema|rundeNN>.test.js`. Server-Logik direkt (`new SpielServer({ kartenDefinition, konfiguration })`, Ticks laufen lassen; Muster `tests/runde24.test.js neueWelt/ticks`). Client-Darstellung: entweder Quelltext-Prüfung (`readFileSync(renderer.js)` enthält …) oder – besser – Modul direkt importieren (`three` ist devDependency; Beispiel `tests/runde45.test.js` mit Mini-Skelett).
- Hilfen `tests/hilfen/aufheben.js` (`hebeAlleAuf`, `amBoden`). Zufall/Konfig für Tests: `konsum.dauer = 0`, `haustiere.zaehmChance = 1`, `mehrspieler.niederDauer = 0`, `welt.uebergangSekunden = 0`; Türen manuell offen halten `welt.tuerHaltOffen.set(id, 999)`.
- Welche Tests zu welchem System gehören, steht unten in der jeweiligen `ki/<thema>.md`.

## Umgebung & bekannte Eigenheiten
- Cloud: Chromium + Playwright vorinstalliert (`require('playwright')`), Software-GL ≈ 2–10 FPS → Klicks ≥ 600 ms halten, Zombies/Gottmodus (macht `ansicht` automatisch), Messungen über mehrere Frames; nach Login auf `#laden` hidden warten; nach `zone()` 2 s warten.
- Zwei Browser + Software-GL: Server-Herzschlag kickt den 2. Browser → Env `HERZSCHLAG_MS=120000` (macht `rauchtestFunk`), Logins nacheinander. WebRTC in der Sandbox: Chromium-Flag `--disable-features=WebRtcHideLocalIpsWithMdns` (keine mDNS-Auflösung). Hintergrund-Drosselung lässt sich headless nicht nachstellen (Tabs bleiben sichtbar).
- Gelegentlich rot durch Zufall: `runde44_2` „gehen ihrer Wege“ (Bots) – einmal wiederholen, bleibt es rot, ist es echt.
- `npm test` braucht `npm install` (three, ws, MCP-SDK). `tests/studio.test.js` scheitert ohne `@modelcontextprotocol/sdk`; unter Windows teils CRLF-Probleme – das ist umgebungsbedingt.
- Lokal beim Nutzer (Windows, Projekt in OneDrive): keine Temp-Kopien/Worktrees im Projektordner; Browser-Pane muss sichtbar sein (sonst steht rAF, Screens bleiben alt).
- Screens ohne Fenster lokal: Canvas `toDataURL` → `PUT /api/editor/datei?pfad=client/audio/karten/<ordner>/<name>.wav` (nur Audio-Endungen erlaubt) → umbenennen, lesen, löschen.
