# Runde 37 – Boden/Nebel-Aufräumen
- `C:darstellung/renderer.js` (~Z.2380): Bodennebel-Stärke × `(1 − innenAnteil)` → drinnen kein Nebel-Schleier (Wetter nebel/Morgen). Draußen unverändert.
- `C:darstellung/bodenTextur.js`: `#asphaltKoernung` (Pünktchen) entfernt → `#weicherTon(ctx,tx,ty,stufe)` = weltfeste sanfte Hell/Dunkel-Tönung in 8-px-Blöcken (Asphalt/Straße 0,07).
- Innenböden `holz`/`fliesen`/`beton` nicht mehr aus Atlas-Quadraten, sondern `#innenBoden`: Holz = Dielen in Weltkoordinaten (8 px, Stöße versetzt alle 96 px), Fliesen/Beton = glatte Fläche + Tönung. Atlas-Einträge `boden.holz/fliesen/beton` bleiben ungenutzt (Karte/Editor nutzen weiter dieselbe Klasse).
- ⚠ Alles deterministisch aus Weltkoordinaten (Blöcke `renderePortionen` müssen nahtlos passen) – nie `Math.random`/Kachel-Index lokal je Canvas.
- Teppich = Atlas-OBJEKT (`#zeichneObjekt`) mit eigenem Karomuster, bewusst unverändert.
- Tests: keine neuen; `tests/studio.test.js` rot = fehlendes `@modelcontextprotocol/sdk` (umgebungsbedingt).
