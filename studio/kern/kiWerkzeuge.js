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
const xyz = (beschreibung) => ({ type: 'array', items: { type: 'number' }, description: `${beschreibung} [x, y, z]` });
const jaNein = (beschreibung) => ({ type: 'boolean', description: beschreibung });
const W = 'Modell-Werkstatt: ';

/**
 * Modell-Werkstatt (Phase 3) – ausgeführt von studio/kern/kiModelle.js über dieselben Methoden wie die Oberfläche
 * (werkstatt/werkstatt.js, werkstatt/modellWerk.js). Teile-/Material-Referenzen: Name (aus modell_info) oder uuid.
 */
export const KI_MODELL_WERKZEUGE = [
  { name: 'modelle_liste', beschreibung: `${W}3D-Modelle des Spiels (client/assets/eigene) suchen: Dateiname (stem), Name, Bereich, Höhe im Spiel, Kollision.`, schema: objekt({ suche: text('Suchwort'), bereich: text('optional: natur, tiere, bau, moebel, fahrzeuge, gegenstaende, essen, deko') }), lesen: true },
  { name: 'werkstatt_oeffnen', beschreibung: `${W}öffnen und ein Modell laden (modell = stem aus modelle_liste) ODER ein neues Modell aus Grundkörpern beginnen (neu = Name). Ungespeicherte Änderungen gehen dabei verloren.`, schema: objekt({ modell: text('stem, z. B. wooden-chair'), neu: text('Name eines neuen Modells') }) },
  { name: 'werkstatt_schliessen', beschreibung: `${W}schließen, zurück zum Karten-Editor (ungespeicherte Änderungen bleiben in der Werkstatt erhalten, bis ein anderes Modell geladen wird).`, schema: objekt({}) },
  { name: 'modell_info', beschreibung: `${W}alles zum offenen Modell: Spiel-Einstellungen, Maße, Teile (Baum mit Lage), Materialien, Animationen, „benutzt in Zonen“.`, schema: objekt({}), lesen: true },
  {
    name: 'modell_einstellen',
    beschreibung: `${W}Spiel-Einstellungen des offenen Modells (gelten nach modell_speichern): Höhe im Spiel (m), Kollision, Ebene, eigene Grundfläche (Kacheln) oder automatisch, Name, Bereich, Credits.`,
    schema: objekt({ hoehe: zahl('Höhe im Spiel in m (0,05–20)'), kollision: jaNein('steht im Weg (true) oder man läuft hindurch (false)'), ebene: text('moebel = normal, boden = flach (man läuft drüber), oben = über den Figuren', ['moebel', 'boden', 'oben']), grundflaeche_b: zahl('Breite in Kacheln'), grundflaeche_t: zahl('Tiefe in Kacheln'), grundflaeche_auto: jaNein('true = aus den Modell-Proportionen'), name: text('Anzeigename'), bereich: text('natur, tiere, bau, moebel, fahrzeuge, gegenstaende, essen, deko'), urheber: text('Credits'), lizenz: text('z. B. CC0'), quelle: text('URL') }),
  },
  {
    name: 'modell_teil_hinzu',
    beschreibung: `${W}Grundkörper anfügen (kiste, zylinder, kugel, kegel, keil, ring, platte). Maße/Position in Modell-Einheiten (bei neuen Modellen = Meter), y = oben. Ohne Position steht der Körper mittig auf dem Boden.`,
    schema: objekt({ form: text('Grundkörper', ['kiste', 'zylinder', 'kugel', 'kegel', 'keil', 'ring', 'platte']), name: text('Teilname'), groesse: xyz('Größe (Breite, Höhe, Tiefe)'), position: xyz('Mittelpunkt'), drehung: xyz('Drehung in Grad'), farbe: text('#rrggbb'), eltern: text('optional: an dieses Teil hängen') }, ['form']),
  },
  {
    name: 'modell_teil_aendern',
    beschreibung: `${W}ein Teil verschieben/drehen/skalieren, umbenennen, ein-/ausblenden (ausgeblendet = fehlt beim Speichern) oder an ein anderes Teil hängen. Fehlende Felder bleiben.`,
    schema: objekt({ teil: text('Name oder uuid'), position: xyz('Position'), drehung: xyz('Drehung in Grad'), groesse: xyz('Größe als Faktor'), name: text('neuer Name'), sichtbar: jaNein('sichtbar'), eltern: text('Teil, an das es gehängt wird ("" = Modell)') }, ['teil']),
  },
  { name: 'modell_teil_loeschen', beschreibung: `${W}Teil (mit Kindern) entfernen.`, schema: objekt({ teil: text('Name oder uuid') }, ['teil']) },
  { name: 'modell_teil_duplizieren', beschreibung: `${W}Teil kopieren (liegt daneben). Liefert den neuen Namen.`, schema: objekt({ teil: text('Name oder uuid') }, ['teil']) },
  {
    name: 'modell_material',
    beschreibung: `${W}Material ändern (Farbe, Rauheit 0–1, Metall 0–1). material = Material-Name/uuid aus modell_info oder ein Teil-Name (dessen Material). eigenes = Teil bekommt vorher ein eigenes Material (andere Teile bleiben unverändert).`,
    schema: objekt({ material: text('Material- oder Teil-Name'), farbe: text('#rrggbb'), rauheit: zahl('0–1'), metall: zahl('0–1'), eigenes: jaNein('nur dieses Teil umfärben') }, ['material']),
  },
  { name: 'modell_farbton', beschreibung: `${W}Farben des ganzen Modells verschieben (Farbton in Grad −180…180, Sättigung/Helligkeit als Faktor, 1 = gleich).`, schema: objekt({ grad: zahl('Farbton-Drehung'), saettigung: zahl('Faktor'), helligkeit: zahl('Faktor') }) },
  { name: 'modell_ausrichten', beschreibung: `${W}ganzes Modell drehen (achse x|y|z, winkel), spiegeln (achse) oder Ursprung unten mittig setzen.`, schema: objekt({ aktion: text('Aktion', ['drehen', 'spiegeln', 'ursprung']), achse: text('x, y oder z', ['x', 'y', 'z']), winkel: zahl('Grad (Standard 90)') }, ['aktion']) },
  {
    name: 'modell_animation',
    beschreibung: `${W}Animationen: neu (art drehen|wippen|pendeln|pulsieren|flackern, teil leer = ganzes Modell, achse, dauer s, staerke ° / Einheiten / Faktor; läuft im Spiel als Leerlauf), loeschen/leerlauf/abspielen (name), stopp. leerlauf mit leerem name = keine Leerlauf-Animation.`,
    schema: objekt({ aktion: text('Aktion', ['neu', 'loeschen', 'leerlauf', 'abspielen', 'stopp']), art: text('Bewegung', ['drehen', 'wippen', 'pendeln', 'pulsieren', 'flackern']), teil: text('Teil-Name'), achse: text('x, y, z', ['x', 'y', 'z']), dauer: zahl('Sekunden'), staerke: zahl('Stärke'), name: text('Clip-Name') }, ['aktion']),
  },
  { name: 'modell_bild', beschreibung: `${W}Bild der Bühne (wie im Spiel eingepasst, mit 1,8-m-Figur und Grundfläche). blick: schraeg, vorne, seite, oben.`, schema: objekt({ blick: text('Blickrichtung', ['schraeg', 'vorne', 'seite', 'oben']) }), lesen: true },
  { name: 'modell_rueckgaengig', beschreibung: `${W}letzten Schritt zurücknehmen (wiederholen = true: wiederherstellen).`, schema: objekt({ wiederholen: jaNein('wiederholen statt rückgängig') }) },
  { name: 'modell_speichern', beschreibung: `${W}speichern: ersetzt die .glb (alte Fassung wird gesichert) oder als_kopie = Name einer neuen Datei. Neue Modelle bekommen einen Dateinamen aus dem Namen. Offene Zonen, die das Modell benutzen, werden angeglichen. Danach steht es im Karten-Editor unter Modelle (modell:<stem>).`, schema: objekt({ als_kopie: text('Name der Kopie') }) },
];

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
    beschreibung: 'Bereich markieren (für Zombies: zombie_bereich). art: loot (Loot-Zone: tabelle oder items), tiere (Hasen: anzahl), uebergang (ziel = Zielzone, ankunft = Ankunftspunkt dort), klang (datei = Pfad unter client/audio/…, lautstaerke 0–1).',
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
  { name: 'notizen_liste', beschreibung: 'Notiz-Pins der Zone (Aufgaben/Ideen der Menschen, z. B. „hier fehlt eine Tankstelle“) mit ID, Lage, erledigt.', schema: objekt({}), lesen: true },
  { name: 'notiz_setzen', beschreibung: 'Notiz-Pin setzen (z. B. für offene Fragen an Menschen).', schema: objekt({ x: zahl('x'), y: zahl('y'), text: text('Text') }, ['x', 'y', 'text']) },
  { name: 'notiz_erledigt', beschreibung: 'Notiz als erledigt markieren (oder wieder öffnen).', schema: objekt({ id: zahl('Notiz-ID'), erledigt: { type: 'boolean', description: 'true = erledigt' } }, ['id']) },
  { name: 'weltkarte', beschreibung: 'Alle Zonen mit ihren Übergängen (Ziel, Ankunft, Rückweg vorhanden?) und Problemen.', schema: objekt({}), lesen: true },
  { name: 'laufweg_pruefen', beschreibung: 'Was ist vom Spieler-Start/den Ankünften zu Fuß erreichbar? Liefert unerreichbare Loot-/Spawnpunkte, Übergänge und eingesperrte Flächen (fehlende Türen).', schema: objekt({}), lesen: true },
  { name: 'balance', beschreibung: 'Balance der offenen Zone: Loot je Stunde nach Bereich (Essen, Trinken, Medizin, Waffen, Munition, Material), Zombies, Gefahr und Versorgung je 1000 begehbare Kacheln.', schema: objekt({}), lesen: true },
  {
    name: 'zombie_bereich',
    beschreibung: 'Zombie-Bereich anlegen: anzahl Zombies (1–60) auf freien Außenkacheln im Rechteck; tageszeit immer/tag/nacht; varianten = Mischung nach Gewicht (normal, laeufer, halb, sprinter, spucker, gepanzert, explosiv, brocken); route = Patrouille (≥ 2 Punkte, z. B. Nacht-Horde).',
    schema: objekt({ ...rechteck, anzahl: zahl('Anzahl'), tageszeit: text('Tageszeit', ['immer', 'tag', 'nacht']), varianten: { type: 'object', description: 'z. B. { "normal": 6, "laeufer": 2 }' }, route: { type: 'array', items: { type: 'object', properties: { x: zahl('x'), y: zahl('y') } }, description: 'Wegpunkte' }, name: text('Name') }, ['x', 'y', 'b', 'h']),
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
  ...KI_MODELL_WERKZEUGE,
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
  '3D-Modelle bearbeitest du in der Modell-Werkstatt: modelle_liste → werkstatt_oeffnen (modell oder neu) → modell_info → modell_teil_hinzu/_aendern, modell_material, modell_animation, modell_einstellen (Höhe, Kollision, Grundfläche) → modell_bild zum Prüfen → modell_speichern. Das Spiel passt jedes Modell in Grundfläche × Höhe ein.',
].join('\n');
