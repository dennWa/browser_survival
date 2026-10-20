# Musik (Zonen-Musik)

Hier liegt die Hintergrundmusik – **ein Ordner pro Zone**:

| Ordner | Wann läuft die Musik? |
|---|---|
| `stadtrand/` | in der Zone „Stadtrand“ (Krankenhaus, Stadt) |
| `waldweg/` | in der Zone „Waldweg“ (Wald, See) |
| `alle/` | in **jeder** Zone (zusätzlich zu den Stücken der Zone) |
| `hauptmenue/` | auf dem Login-Bildschirm / Hauptmenü (startet nach dem ersten Klick – Browser-Regel) |
| `<neue-zonen-id>/` | neuer Ordner für jede weitere Zone (Name = Zonen-ID aus `server/spiel/karten/`) |

Unterstützt: `.mp3 .ogg .wav .m4a .flac .opus`. Das Spiel wählt zufällig ein Stück der aktuellen Zone (oder der Reihe nach,
wenn in `einstellungen.json` `"zufall": false` steht – Reihenfolge über `"reihenfolge": [...]`),
blendet beim Zonenwechsel sanft über und spielt danach das nächste. Lautstärke: ⚙ Einstellungen → „Musik“.

**Am einfachsten:** Map-Editor lokal starten (`npm run editor:lokal`) → 🎵 Audio-Zentrale → Gruppe Musik: Titel hochladen,
kürzen/einblenden, Reihenfolge, entfernen – Dateien, `einstellungen.json` und `musik.json` landen automatisch hier.

**Von Hand – nach dem Ablegen neuer Dateien:** `npm run musik:index` (schreibt `musik.json`, weil Browser keine
Ordner auflisten dürfen), dann committen.

Bitte nur Musik mit passender Lizenz (CC0 / CC-BY mit Namensnennung im Credits-Dialog / selbst gemacht).
