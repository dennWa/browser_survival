# KI mit dem Studio verbinden (MCP) – Schritt für Schritt

**Kurz:** MCP („Model Context Protocol“) ist ein Stecker, über den eine KI-App auf deinem Rechner das Studio fernsteuert –
wie ein zweiter Mensch an der Maus. Die KI sieht dieselben Werkzeuge wie du (Zonen bauen, Modelle bemalen/animieren,
Sounds schneiden, Items/Loot/Rezepte, Notizen abarbeiten …). Jede ihrer Aktionen ist ein eigener Undo-Schritt „KI: …“.

| | KI-Reiter im Studio | MCP |
|---|---|---|
| Was brauche ich? | API-Schlüssel (Anthropic, Google, OpenAI …) | eine KI-App: Claude Desktop, Claude Code, Cursor … |
| Kosten | pro Nutzung über den Schlüssel | dein vorhandenes Abo |
| Wo tippe ich? | rechts im Studio | in der KI-App |

Im Studio: **Hilfe → KI verbinden** (oder Klick auf „MCP bereit“ unten rechts). Der Dialog zeigt alle Texte zum Kopieren
und eine **Lampe**: grün = eine KI hat sich gerade gemeldet.

## 1. Einmalig verbinden

### Claude Desktop
1. [Node.js](https://nodejs.org) installieren (LTS).
2. Claude Desktop → **Einstellungen → Entwickler → Konfiguration bearbeiten**
   (Windows: `%APPDATA%\Claude\claude_desktop_config.json`, macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).
3. Den Text aus dem Studio-Dialog (Reiter „Claude Desktop“) hineinkopieren und speichern. Er sieht so aus:
   ```json
   { "mcpServers": { "browser-survival-studio": { "command": "node", "args": ["<Spielordner>/studio/mcp-bruecke.mjs"] } } }
   ```
   Gibt es schon `mcpServers`, nur den Eintrag `browser-survival-studio` dazusetzen.

### Claude Code (Terminal)
Im Spielordner einmal den Befehl aus dem Dialog ausführen (`claude mcp add --transport http browser-survival-studio …`).
Danach `claude` im Spielordner starten. `/mcp` zeigt, ob die Verbindung steht.

### Cursor, VS Code & andere
MCP-Server vom Typ **Streamable HTTP** mit der URL und dem `Authorization`-Kopf aus dem Dialog anlegen.

## 2. KI-App neu starten
Das Studio muss offen sein. In Claude Desktop steht danach unter „Werkzeuge“ der Eintrag **browser-survival-studio**.

## 3. Loslegen – Beispiele
- „Schau dir im Browser Survival Studio die offenen Notizen an und arbeite sie ab.“
- „Öffne die Zone waldweg und bau am See eine kleine Fischerhütte mit Steg und etwas Loot.“
- „Mach in der Modell-Werkstatt den Zombie gruseliger (dunkler, Blut, Dreck) und speichere als Kopie.“
- „Schneide den Sound schritt_gras auf 0,5 s und mach ihn leiser.“

Tipp: **Vorschlagsmodus** im KI-Reiter einschalten → KI-Änderungen bleiben farbig markiert, bis du sie übernimmst
oder einzeln wegklickst.

## Wenn es nicht klappt
| Problem | Lösung |
|---|---|
| Lampe bleibt grau | KI-App wirklich neu gestartet? Studio offen? Bei Claude Desktop: Node.js installiert? |
| „Token fehlt oder falsch“ | Der Kopf/Befehl stammt von einer anderen Studio-Installation → aus dem Dialog neu kopieren. |
| „Studio lädt noch“ | Kurz warten, bis das Startbild weg ist, dann nochmal. |
| Port belegt | Das Studio nimmt automatisch einen freien Port. Claude Desktop (Brücke) findet ihn selbst, für Claude Code/Cursor den Befehl neu kopieren. |

**Sicherheit:** Der Server lauscht nur auf `127.0.0.1` (nur dieser Rechner) und verlangt das Token. Browser-Seiten werden abgewiesen.

---

# Wo liegt mein Stand? (Entwurf → Im Spiel → Online)

Unten in der Statusleiste steht für die offene Zone `✓ Entwurf › ○ Im Spiel › ○ Online` (Klick = Erklärung + Knopf für den nächsten Schritt):

1. **Entwurf** (Strg+S, automatisch alle 60 s): Arbeitsstand unter `.studio/entwuerfe/`. Nur das Studio sieht ihn.
2. **Im Spiel** (Strg+Umschalt+E): schreibt `server/spiel/karten/<id>.js`. Lokales Spiel und Testlauf haben die Zone.
3. **Online** (Strg+Umschalt+P, „Veröffentlichen“): Tests → Commit → Push. GitHub Pages zeigt sie nach 1–3 Minuten.

Gesetzte Punkte (Start, Ausgänge, Spawns, Notizen …) gehören zur Zone und wandern bei jedem Schritt mit.
