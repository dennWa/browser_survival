# Startpaket für eine KI mit kleinem Limit (z. B. Claude Free)

> Den Block unter „Kopiervorlage“ als **erste Nachricht** einfügen, danach die Aufgabe. Dazu je nach Aufgabe 1–2 Dateien anhängen (Liste unten). Nie das ganze Projekt schicken.

## Kopiervorlage

```
Du hilfst bei „Browser Survival“: einem 3D-Top-Down-Survival-Spiel im Browser (Three.js),
Mehrspieler mit Node.js-Server. Setting: Stadtrand um ein Krankenhaus (St. Elisabeth),
Wald mit See, Zombies (nachts Horde), Plündern, Crafting an der Werkbank, Basisbau, Angeln,
Hasenjagd, Beete, Autos. Ein Tag = 10 Min, Nacht = 5 Min. Spielersprache: Deutsch.

Regeln für deine Antworten:
- Code: Vanilla JS (ES-Module), kein Build, Bezeichner deutsch ohne Umlaute (z. B. schaden, abklingzeit),
  Kommentare deutsch.
- Spiellogik läuft nur auf dem Server; du schreibst nur reine Daten oder reine Funktionen
  (keine DOM-/Node-Importe), außer ich sage etwas anderes.
- Halte dich exakt an das Format der angehängten Beispiele. Erfinde keine Item-IDs, die dort nicht stehen,
  außer du markierst sie mit „NEU:“.
- Antworte kurz: nur das Ergebnis (Codeblock oder Liste), keine langen Erklärungen.
- Ist etwas unklar, stelle höchstens 3 Rückfragen.
```

## Welche Dateien anhängen? (alle klein)

| Aufgabe | Anhängen |
|---|---|
| Neue Items/Essen/Waffen | `server/spiel/konfiguration/gegenstaende.js` (12 KB) |
| Crafting-Rezepte | `rezepte.js` (5 KB) + Item-Liste (Auszug aus `gegenstaende.js`, nur die Namen reichen) |
| Loot/Beute pro Raum | `lootTabellen.js` (7 KB) |
| Balancing (Schaden, Hunger, Zombies) | `server/spiel/konfiguration/spielKonfiguration.js` (11 KB) |
| Quests / neue Mechanik (Ideen, Entwurf) | `README.md` (Spielüberblick) + `gemeinsam/konstanten.js` (3 KB); Hinweis: **ein Quest-System gibt es noch nicht**, er soll nur Datenformat + Beispielquests vorschlagen |
| Texte, Tutorial, Credits | `README.md` |
| Kleine reine Funktion | nur die Spezifikation: Eingabe, Ausgabe, 3 Beispiele |

**Nicht schicken:** `KI_INDEX.md` (63 KB) und `project_manifest.md` (103 KB) – viel zu groß fürs Free-Limit.

## Zurück ins Projekt
Ergebnis dem Haupt-Claude geben („Free-KI hat das geliefert, bitte einbauen, testen, dokumentieren“). `npm test` prüft u. a., ob alle Item-Namen in Rezepten/Loot existieren und ob Icons vorhanden sind – Fehler sind also schnell sichtbar.
