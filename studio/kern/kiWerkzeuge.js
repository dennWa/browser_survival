/**
 * KI-Werkzeuge des Studios – EINE Liste für beide Wege (umgebungsfrei, reine Daten):
 *   MCP-Server (studio/main/mcp.mjs → Claude Desktop/Code, Cursor …) und eingebauter Assistent (studio/main/ki.mjs).
 * Ausgeführt werden sie im Studio-Fenster (studio/kern/kiAusfuehren.js) über die Befehlsschicht → Undo-fähig, live sichtbar,
 * jede KI-Aktion ist ein eigener Undo-Schritt „KI: …“.
 * Koordinaten: Kacheln (x nach rechts/Osten, y nach unten/Süden), 1 Kachel ≈ 1 m. Schemas bewusst einfach (Gemini-tauglich:
 * keine oneOf/additionalProperties).
 */
const zahl = (beschreibung) => ({ type: 'number', description: beschreibung });
const text = (beschreibung, auswahl) => ({ type: 'string', description: beschreibung, ...(auswahl ? { enum: auswahl } : {}) });
const rechteck = { x: zahl('linke Kachel'), y: zahl('obere Kachel'), b: zahl('Breite in Kacheln'), h: zahl('Höhe in Kacheln') };
const objekt = (eigenschaften, pflicht = []) => ({ type: 'object', properties: eigenschaften, required: pflicht });

export const KI_WERKZEUGE = Object.freeze([
  {
    name: 'anleitung',
    beschreibung: 'Kurze Regeln zum Kartenbau in Browser Survival (Kacheln, Wände, Räume, Loot, Spawns). Zuerst aufrufen.',
    schema: objekt({}),
    lesen: true,
  },
  { name: 'zonen_liste', beschreibung: 'Alle Zonen des Spiels und Entwürfe (id, Name, Größe, im Spiel?).', schema: objekt({}), lesen: true },
  { name: 'zone_oeffnen', beschreibung: 'Zone zum Bearbeiten öffnen (wird die aktive Zone).', schema: objekt({ id: text('Zonen-ID') }, ['id']) },
  {
    name: 'zone_neu',
    beschreibung: 'Neue leere Zone anlegen und öffnen.',
    schema: objekt({ id: text('ID a–z, 0–9, _'), name: text('Anzeigename'), breite: zahl('Kacheln, 20–1500'), hoehe: zahl('Kacheln, 20–1500'), boden: text('Kachelzeichen für den Grundboden, z. B. "," = Gras') }, ['id', 'name', 'breite', 'hoehe']),
  },
  { name: 'zone_info', beschreibung: 'Überblick über die aktive Zone: Größe, Anzahl Objekte/Räume/Spawns, Legende der Kachelzeichen.', schema: objekt({}), lesen: true },
  {
    name: 'zone_ausschnitt',
    beschreibung: 'Kartenausschnitt als Text-Raster (1 Zeichen = 1 Kachel; Großbuchstaben S/Z = Spieler-Start/Zombie, o = Objekt, a–z = Loot-Punkte). Max. 100 × 70.',
    schema: objekt(rechteck, ['x', 'y', 'b', 'h']),
    lesen: true,
  },
  {
    name: 'katalog',
    beschreibung: 'Bausteine suchen: Böden (kachel:<zeichen>), Objekte (objekt:<typ>), 3D-Modelle aus dem Spielordner (modell:<datei>), Vorlagen (vorlage:<id>). Liefert id, Name, Grundfläche.',
    schema: objekt({ suche: text('Suchwort, z. B. "baum", "tisch", "auto"'), kategorie: text('optional: Kategorie') }),
    lesen: true,
  },
  {
    name: 'boden_malen',
    beschreibung: 'Rechteck mit einer Bodenkachel füllen (auch Wände "#" oder Wasser "~").',
    schema: objekt({ zeichen: text('Kachelzeichen aus dem Katalog'), ...rechteck }, ['zeichen', 'x', 'y', 'b', 'h']),
  },
  {
    name: 'wand_ziehen',
    beschreibung: 'Gerade Wand von (x0,y0) nach (x1,y1) (waagerecht oder senkrecht). art: wand, fenster oder tuer.',
    schema: objekt({ x0: zahl('Start x'), y0: zahl('Start y'), x1: zahl('Ende x'), y1: zahl('Ende y'), art: text('Art', ['wand', 'fenster', 'tuer']) }, ['x0', 'y0', 'x1', 'y1']),
  },
  {
    name: 'raum_bauen',
    beschreibung: 'Rechteckigen Raum bauen: Wände rundum, Innenboden, eine Tür, optional als Loot-Raum (Raumname + Loot-Tabelle).',
    schema: objekt({ ...rechteck, boden: text('Innenboden: "." Fliesen, ":" Beton, "+" Holz'), tuer: text('Tür-Seite', ['n', 's', 'o', 'w']), name: text('Raumname, z. B. "Küche"'), lootTabelle: text('optional: Loot-Tabelle, z. B. kueche, wohnung, lager') }, ['x', 'y', 'b', 'h']),
  },
  {
    name: 'objekt_platzieren',
    beschreibung: 'Objekt/Modell setzen. x/y = linke obere Ecke (Kacheln, Brüche erlaubt). drehung in Grad, skalierung 0,25–4 (größer = nimmt mehr Platz ein).',
    schema: objekt({ id: text('Katalog-ID, z. B. objekt:baum oder modell:wooden-chair'), x: zahl('x'), y: zahl('y'), drehung: zahl('Grad (0, 90, 180, 270 oder frei)'), skalierung: zahl('Größe, 1 = normal') }, ['id', 'x', 'y']),
  },
  {
    name: 'objekte_auflisten',
    beschreibung: 'Objekte (mit ID) in einem Bereich auflisten (ohne Bereich: alle, max. 300).',
    schema: objekt(rechteck),
    lesen: true,
  },
  {
    name: 'objekt_aendern',
    beschreibung: 'Objekt ändern: Position, Drehung, Skalierung oder Name.',
    schema: objekt({ id: zahl('Objekt-ID aus objekte_auflisten'), x: zahl('neue x'), y: zahl('neue y'), drehung: zahl('Grad'), skalierung: zahl('Größe'), name: text('Name') }, ['id']),
  },
  {
    name: 'loeschen',
    beschreibung: 'Einträge löschen. sammlung: objekte (Standard), spawnpunkte, lootZonen, raumFlaechen, tierBereiche, uebergaenge, klaenge.',
    schema: objekt({ ids: { type: 'array', items: { type: 'number' }, description: 'IDs' }, sammlung: text('Sammlung') }, ['ids']),
  },
  {
    name: 'flaeche_anlegen',
    beschreibung: 'Bereich markieren. art: loot (Loot-Zone: tabelle oder items), tiere (Hasen: anzahl), uebergang (ziel = Zielzone, ankunft = Ankunftspunkt dort), klang (datei = Pfad unter client/audio/…, lautstaerke 0–1).',
    schema: objekt({ art: text('Art', ['loot', 'tiere', 'uebergang', 'klang']), ...rechteck, name: text('Name'), tabelle: text('Loot: Loot-Tabelle'), punkte: zahl('Loot: Anzahl Punkte'), anzahl: zahl('Tiere: Anzahl'), ziel: text('Übergang: Zielzone'), ankunft: text('Übergang: Ankunftsname in der Zielzone'), datei: text('Klang: Datei'), lautstaerke: zahl('Klang: 0–1') }, ['art', 'x', 'y', 'b', 'h']),
  },
  {
    name: 'marker_setzen',
    beschreibung: 'Punkt setzen: start (Spieler-Start), zombie, horde (nur nachts), ankunft (name = Ankunftsname für Übergänge).',
    schema: objekt({ art: text('Art', ['start', 'zombie', 'horde', 'ankunft']), x: zahl('x'), y: zahl('y'), name: text('Ankunft: Name'), anzahl: zahl('Zombies: Anzahl') }, ['art', 'x', 'y']),
  },
  {
    name: 'spawnpunkt_setzen',
    beschreibung: 'Item-Spawnpunkt: ein Item (z. B. apfel) oder eine Tabelle (tabelle:kueche) an genau dieser Stelle; chance in %, Versuch alle intervall Minuten (Echtzeit). hoehe > 0 = liegt auf einem Möbel (Tisch ≈ 0,75).',
    schema: objekt({ x: zahl('x (Kachel + Bruch, 12.5 = Mitte)'), y: zahl('y'), inhalt: text('Item-ID oder tabelle:<name>'), chance: zahl('0–100'), intervall: zahl('Minuten'), menge_min: zahl('Menge min'), menge_max: zahl('Menge max'), hoehe: zahl('Ablagehöhe in Kacheln') }, ['x', 'y', 'inhalt']),
  },
  {
    name: 'gelaende',
    beschreibung: 'Gelände formen (runder Pinsel): heben, senken, glaetten, ebnen.',
    schema: objekt({ modus: text('Modus', ['heben', 'senken', 'glaetten', 'ebnen']), x: zahl('Mitte x'), y: zahl('Mitte y'), radius: zahl('Kacheln'), staerke: zahl('Meter je Anwendung') }, ['modus', 'x', 'y']),
  },
  {
    name: 'streuen',
    beschreibung: 'Bäume/Büsche/Steine im Kreis verteilen (ohne Überlappen, nur auf Naturboden). set: wald, nadelwald, gebuesch, felsen – oder typen (Katalog-IDs). radieren=true entfernt sie wieder.',
    schema: objekt({ x: zahl('Mitte x'), y: zahl('Mitte y'), radius: zahl('Kacheln'), set: text('Set', ['wald', 'nadelwald', 'gebuesch', 'felsen']), typen: { type: 'array', items: { type: 'string' }, description: 'statt set: Katalog-IDs' }, dichte: zahl('Objekte je 100 Kacheln (Standard 4)'), radieren: { type: 'boolean', description: 'entfernen statt setzen' } }, ['x', 'y', 'radius']),
  },
  {
    name: 'strasse_bauen',
    beschreibung: 'Gerade Straße (waagerecht oder senkrecht) mit Gehwegen, Mittelmarkierung und Laternen; Objekte auf der Fahrbahn werden entfernt.',
    schema: objekt({ x0: zahl('Start x'), y0: zahl('Start y (Mitte der Straße)'), x1: zahl('Ende x'), y1: zahl('Ende y'), fahrbahn: zahl('Breite der Fahrbahn (2, 4, 6)'), gehweg: zahl('Gehwegbreite (0–2)'), laternen: zahl('Laterne alle N Kacheln, 0 = keine') }, ['x0', 'y0', 'x1', 'y1']),
  },
  {
    name: 'ersetzen',
    beschreibung: 'In einem Bereich (ohne Bereich: ganze Zone) Objekte eines Typs durch eine Katalog-ID ersetzen und/oder Bodenkacheln tauschen.',
    schema: objekt({ ...rechteck, von_typ: text('Objekttyp, z. B. baum_herbst'), zu: text('Katalog-ID, z. B. objekt:tanne'), von_kachel: text('Kachelzeichen'), zu_kachel: text('Kachelzeichen') }),
  },
  {
    name: 'generieren',
    beschreibung: 'Startpunkt generieren: wald / nadelwald (Waldboden, Bäume, Lichtung, See) oder dorf (Straße + Häuser, auf Wunsch aus Vorlagen).',
    schema: objekt({ art: text('Art', ['wald', 'nadelwald', 'dorf']), ...rechteck, dichte: zahl('Wald-Dichte 1–15'), haeuser: zahl('Dorf: Anzahl Häuser'), mit_vorlagen: { type: 'boolean', description: 'Dorf: eigene Vorlagen als Häuser' }, saat: zahl('Variante') }, ['art', 'x', 'y', 'b', 'h']),
  },
  { name: 'vorlagen_liste', beschreibung: 'Gespeicherte Vorlagen (z. B. Häuser) mit Größe.', schema: objekt({}), lesen: true },
  { name: 'vorlage_einsetzen', beschreibung: 'Vorlage an (x, y) (linke obere Ecke) einsetzen.', schema: objekt({ id: text('Vorlagen-ID'), x: zahl('x'), y: zahl('y') }, ['id', 'x', 'y']) },
  { name: 'pruefen', beschreibung: 'Zone prüfen: Fehler und Hinweise (Spawns in Wänden, unerreichbare Räume …).', schema: objekt({}), lesen: true },
  { name: 'rueckgaengig', beschreibung: 'Letzten Schritt zurücknehmen.', schema: objekt({}) },
  { name: 'speichern', beschreibung: 'Arbeitsstand der Zone als Entwurf speichern (nicht ins Spiel).', schema: objekt({}) },
  {
    name: 'ansicht_bild',
    beschreibung: 'Screenshot der Ansicht (zum Selbst-Prüfen). modus 3d oder 2d (Draufsicht); optional Kamera auf (x, y) richten.',
    schema: objekt({ modus: text('Ansicht', ['3d', '2d']), x: zahl('Ziel x'), y: zahl('Ziel y'), zoom: zahl('Sichtweite in Kacheln (10–300)') }),
    lesen: true,
    bild: true,
  },
]);

/** Werkzeug nach Name */
export const kiWerkzeug = (name) => KI_WERKZEUGE.find((w) => w.name === name) ?? null;

/** Kurzanleitung für KIs (Werkzeug `anleitung` + Systemtext des Assistenten) */
export const KI_REGELN = [
  'Du arbeitest im Browser Survival Studio, dem Karten-Editor des Top-Down-Survival-Spiels „Browser Survival“ (Zombies, Loot, Basisbau).',
  'Eine Zone ist ein Kachelraster (1 Kachel ≈ 1 m). x wächst nach rechts (Osten), y nach unten (Süden).',
  'Böden: "," Gras, "$" Rasen, ";" Waldboden, "&" Erde, "!" Sand, "*" Schnee, "_" Asphalt, "=" Straße, "-" Gehweg, "^" Pflaster, "." Fliesen, ":" Beton, "+" Holz, "~" Wasser. Wände: "#" Wand, "F" Fenster, "T" Tür.',
  'Innenräume: Wände rundum + Innenboden (. : +) + mindestens eine Tür. Am einfachsten mit raum_bauen.',
  'Objekte haben eine Grundfläche b × h in Kacheln; blockierende Objekte dürfen keine Türen/Wege versperren. Skalierung vergrößert auch die Grundfläche.',
  'Jede Zone braucht genau einen Spieler-Start (marker_setzen art=start) auf freiem Boden. Zombies draußen platzieren.',
  'Loot: Räume mit Loot-Tabelle (raum_bauen lootTabelle), Loot-Zonen (flaeche_anlegen art=loot) oder einzelne Spawnpunkte (spawnpunkt_setzen).',
  'Übergänge zu anderen Zonen liegen am Kartenrand; die Zielzone braucht einen Ankunftspunkt mit dem angegebenen Namen.',
  'Arbeite in kleinen Schritten, prüfe mit pruefen und ansicht_bild. Fehler lassen sich mit rueckgaengig zurücknehmen.',
].join('\n');
