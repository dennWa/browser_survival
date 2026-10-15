/**
 * Karte: Krankenhaus (Standard-/Testkarte).
 *
 * Legende (siehe gemeinsam/welt/kacheln.js):
 *   ,  Gras        _  Asphalt (Parkplatz)   =  Straße
 *   .  Fliesen     :  Beton                 +  Holzboden
 *   #  Wand        F  Fenster (blockiert)   T  Tür (offen, begehbar)
 *   S  Spieler-Start    Z  Zombie-Spawn
 *   a–k  Loot-Punkte, gehören zum gleichnamigen Raum unten in `raeume`
 *
 * Bearbeiten: Zeichen einfach austauschen. Alle Zeilen müssen gleich lang sein
 * (der Kartenlader prüft das und meldet Fehler mit Zeilennummer).
 *
 * `objekte`: Möbel & Deko in Kachelkoordinaten (x/y = linke obere Ecke, b/h = Größe).
 *   typ        Grafikname aus client/assets/atlas.json → umgebung.objekte
 *   blockiert  true = Kollision (alle Kacheln, deren Mitte im Objekt liegt)
 *   ebene      'boden' (unter allem, z. B. Teppich/Blut) · 'moebel' (Standard) · 'oben' (über Figuren, z. B. Baumkronen)
 *   drehung    0 | 90 | 180 | 270 Grad
 *
 * Lampen: { typ: 'licht', x, y, b: 1, h: 1, radius (Kacheln), farbe, staerke (0..1), flackern }
 */
const M = { blockiert: true }; // Kurzschreibweise für Möbel mit Kollision

/**
 * Parkplatz vor dem Haupteingang: zwei Reihen Parkbuchten (6,5 Kacheln breit) mit Markierungen.
 * belegtOben/belegtUnten: Buchtnummer → Autotyp. Autos stehen quer (drehung 90/270).
 */
function parkplatz({ belegtOben, belegtUnten }) {
  const objekte = [];
  const reihen = [
    { y: 34, belegt: belegtOben },
    { y: 38.6, belegt: belegtUnten },
  ];
  for (const reihe of reihen) {
    for (let i = 0; i <= 7; i++) {
      objekte.push({ typ: 'markierung', x: 7 + i * 6.5 - 0.06, y: reihe.y, b: 0.12, h: 3.4, ebene: 'boden' });
    }
    for (const [bucht, typ] of Object.entries(reihe.belegt)) {
      const drehung = Number(bucht) % 2 ? 270 : 90;
      objekte.push({ typ, x: 7.5 + Number(bucht) * 6.5, y: reihe.y + 0.2, b: 5.5, h: 3, drehung, ...M });
    }
  }
  return objekte;
}

export const KRANKENHAUS = {
  id: 'krankenhaus',
  name: 'St.-Elisabeth-Krankenhaus',
  kacheln: [
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,Z,,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,####FF####FF######FF###FF#######FF####FF######FF###FF###,,,,',
    ',,,,#.............#.............#.............#::::::::::::#,,,,',
    ',,,,#..a....a.....#.............#..c.......c..#::d::::::d::#,,,,',
    ',,,,#.............#..b......b...#.............#::::::::::::#,,,,',
    ',,,,#...........a.#.............#.............#::::::d:::::T,,,,',
    ',,,,#.............#.............#.............#::::::::::::T,,,,',
    ',,,,#.............#......b......#......c......#::::::::::::#,,,,',
    ',,,,#...a.....a...#.............#.............#::d::::::d::#,,,,',
    ',,Z,#.............#.............#.............#::::::::::::#,,,,',
    ',,,,#######TT############TT############TT###########TT######,,,,',
    ',,,,#::::::::::::::::::::::::::::::::::::::::::::::::::::::#,,,,',
    ',,,,#::::::::::::::::::::::::::::::::::::::::::::::::::::::#,,,,',
    ',,,,#::::::::::::::::::::::::::::::::::::::::::::::::::::::#,,,,',
    ',,,,######TT##########TT######::::#####TT###########TT######,,,,',
    ',,,,#............#...........#::::#+++++++++++#++++++++++++#,,,,',
    ',,,,F............#...........#::::#++g+++++g++#++h++++++h++F,,,,',
    ',,,,F..e......e..#..f.....f..#::::#+++++++++++#++++++++++++F,,,,',
    ',,,,#............#...........#::::#+++++g+++++#++++++++++++#,,,,',
    ',,,,F............#...........#::::#+++++++++++#++++++++++++F,,,,',
    ',,,,F.....e......#.....f.....#::::#++g+++++g++#+++++h++++++F,,,,',
    ',,,,#............#...........#::::#+++++++++++#++++++++++++#,,,,',
    ',,,,##########################::::##########################,,,,',
    ',,,,#.............#:::::::::::::::::::::::::::#++++++++++++#,,,,',
    ',,,,#..j.......j..#:::i:::::::::::::::::::i:::#+++k+++++k++#,Z,,',
    ',,,,#.............#:::::::::::::::::::::::::::#++++++++++++#,,,,',
    ',,,,#.............T:::::::::::::::::::::::::::T++++++++++++#,,,,',
    ',,,,#.............T:::::::::::::::::::::::::::T++++++++++++#,,,,',
    ',,,,#..j.......j..#:::i:::::::::::::::::::i:::#++++++k+++++#,,,,',
    ',,,,#.............#:::::::::::::::::::::::::::#++++++++++++#,,,,',
    ',,,,######TT##########FF##FF##TTTT####FF##FF######FF###FF###,,,,',
    ',,,,,,,,_____,,,,,,,,,,,,,,,,______,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,_____,,,,,,,,,,,,,,,,______,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,,,____________________________________________________,,,,,,',
    ',,,,,,____________________________________________________,,,,,,',
    ',,,,,,____________________________________________________,,,,,,',
    ',,,,,,____________________________________________Z_______,,,,,,',
    ',,,,,,_________Z_______________SS_________________________,,,,,,',
    ',,,,,,_________________________SS_________________________,,,,,,',
    ',,,,,,____________________________________________________,,,,,,',
    ',,,,,,____________________________________________________,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,______,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    '================================================================',
    '================================================================',
    '================================================================',
  ],
  raeume: {
    a: { name: 'Apotheke', lootTabelle: 'apotheke' },
    b: { name: 'OP-Saal', lootTabelle: 'op' },
    c: { name: 'Labor', lootTabelle: 'labor' },
    d: { name: 'Lager', lootTabelle: 'lager' },
    e: { name: 'Patientenzimmer 1', lootTabelle: 'patientenzimmer' },
    f: { name: 'Patientenzimmer 2', lootTabelle: 'patientenzimmer' },
    g: { name: 'Kantine', lootTabelle: 'kantine' },
    h: { name: 'Sicherheitsdienst', lootTabelle: 'sicherheit' },
    i: { name: 'Eingangshalle', lootTabelle: 'eingangshalle' },
    j: { name: 'Notaufnahme', lootTabelle: 'notaufnahme' },
    k: { name: 'Verwaltung', lootTabelle: 'verwaltung' },
  },
  objekte: [
    // --- Apotheke (a) ---
    { typ: 'tisch', x: 12, y: 6, b: 3, h: 2, ...M },
    { typ: 'kiste', x: 5, y: 3, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 6, y: 3, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 17, y: 3, b: 1, h: 1, ...M },
    // --- OP-Saal (b) ---
    { typ: 'bett', x: 24, y: 4, b: 2, h: 4, ...M },
    { typ: 'kueche_spuele', x: 30, y: 3, b: 1, h: 1, ...M },
    { typ: 'kueche_spuele', x: 31, y: 3, b: 1, h: 1, ...M },
    { typ: 'blutlache', x: 21.5, y: 7.5, b: 1.6, h: 1.6, ebene: 'boden' },
    // --- Labor (c) ---
    { typ: 'tisch', x: 34, y: 6, b: 3, h: 2, ...M },
    { typ: 'tisch', x: 42, y: 8, b: 3, h: 2, ...M },
    { typ: 'kueche_spuele', x: 44, y: 3, b: 1, h: 1, ...M },
    // --- Lager (d) ---
    { typ: 'kiste', x: 47, y: 3, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 48, y: 3, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 58, y: 3, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 47, y: 10, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 48, y: 10, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 57, y: 10, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 58, y: 10, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 50, y: 6, b: 1, h: 1, ...M },
    // --- Flur ---
    { typ: 'pflanze', x: 5, y: 12, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 58, y: 12, b: 1, h: 1, ...M },
    { typ: 'sessel', x: 16, y: 12, b: 1, h: 1, ...M },
    { typ: 'sessel', x: 17, y: 12, b: 1, h: 1, ...M },
    { typ: 'blutfleck', x: 27, y: 13, b: 1.2, h: 1.2, ebene: 'boden' },
    // --- Patientenzimmer 1 (e) ---
    { typ: 'bett', x: 5, y: 16, b: 2, h: 4, ...M },
    { typ: 'bett', x: 15, y: 16, b: 2, h: 4, ...M },
    { typ: 'kiste_klein', x: 7, y: 16, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 14, y: 16, b: 1, h: 1, ...M },
    { typ: 'sessel', x: 13, y: 22, b: 1, h: 1, ...M, drehung: 180 },
    // --- Patientenzimmer 2 (f) ---
    { typ: 'bett_orange', x: 18, y: 16, b: 2, h: 4, ...M },
    { typ: 'bett_orange', x: 27, y: 16, b: 2, h: 4, ...M },
    { typ: 'kiste_klein', x: 20, y: 16, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 26, y: 16, b: 1, h: 1, ...M },
    { typ: 'sessel_blau', x: 24, y: 22, b: 1, h: 1, ...M, drehung: 180 },
    // --- Kantine (g) ---
    { typ: 'tisch_rund', x: 38, y: 19, b: 1, h: 1, ...M },
    { typ: 'tisch_rund', x: 42, y: 19, b: 1, h: 1, ...M },
    { typ: 'stuhl', x: 38, y: 18, b: 1, h: 1 },
    { typ: 'stuhl', x: 38, y: 20, b: 1, h: 1, drehung: 180 },
    { typ: 'stuhl', x: 42, y: 18, b: 1, h: 1 },
    { typ: 'stuhl', x: 42, y: 20, b: 1, h: 1, drehung: 180 },
    { typ: 'kueche_herd', x: 45, y: 17, b: 1, h: 1, ...M, drehung: 90 },
    { typ: 'kueche_spuele', x: 45, y: 18, b: 1, h: 1, ...M, drehung: 90 },
    { typ: 'kueche_kochfeld', x: 45, y: 19, b: 1, h: 1, ...M, drehung: 90 },
    { typ: 'kueche_spuele', x: 45, y: 20, b: 1, h: 1, ...M, drehung: 90 },
    // --- Sicherheitsdienst (h) ---
    { typ: 'tisch', x: 48, y: 19, b: 3, h: 2, ...M },
    { typ: 'stuhl', x: 49, y: 21, b: 1, h: 1, drehung: 180 },
    { typ: 'sofa_dunkel', x: 54, y: 22, b: 3, h: 1, ...M, drehung: 180 },
    { typ: 'kiste', x: 58, y: 22, b: 1, h: 1, ...M },
    { typ: 'kiste', x: 58, y: 16, b: 1, h: 1, ...M },
    { typ: 'kiste_klein', x: 47, y: 16, b: 1, h: 1, ...M },
    // --- Eingangshalle (i) ---
    { typ: 'teppich_gruen', x: 35, y: 27, b: 3, h: 3, ebene: 'boden' },
    { typ: 'tisch', x: 37, y: 25, b: 3, h: 2, ...M },
    { typ: 'sofa', x: 21, y: 30, b: 3, h: 1, ...M, drehung: 180 },
    { typ: 'sofa', x: 26, y: 30, b: 3, h: 1, ...M, drehung: 180 },
    { typ: 'sessel_blau', x: 43, y: 27, b: 1, h: 1, ...M, drehung: 270 },
    { typ: 'sessel_blau', x: 43, y: 28, b: 1, h: 1, ...M, drehung: 270 },
    { typ: 'pflanze', x: 19, y: 24, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 45, y: 24, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 45, y: 30, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 19, y: 30, b: 1, h: 1, ...M },
    // --- Notaufnahme (j) ---
    { typ: 'bett', x: 5, y: 26, b: 2, h: 4, ...M },
    { typ: 'bett', x: 9, y: 24, b: 2, h: 4, ...M },
    { typ: 'kiste_klein', x: 17, y: 24, b: 1, h: 1, ...M },
    { typ: 'blutfleck', x: 13, y: 28.6, b: 1.2, h: 1.2, ebene: 'boden' },
    { typ: 'blutlache', x: 10.6, y: 29, b: 1.6, h: 1.6, ebene: 'boden' },
    // --- Verwaltung (k) ---
    { typ: 'teppich', x: 48, y: 26, b: 3, h: 3, ebene: 'boden' },
    { typ: 'tisch', x: 54, y: 27, b: 3, h: 2, ...M },
    { typ: 'stuhl', x: 55, y: 29, b: 1, h: 1, drehung: 180 },
    { typ: 'sofa_dunkel', x: 48, y: 24, b: 3, h: 1, ...M },
    { typ: 'kiste', x: 58, y: 30, b: 1, h: 1, ...M },
    { typ: 'pflanze', x: 58, y: 24, b: 1, h: 1, ...M },
    // --- Außen: Bäume und Büsche (Kronen über den Figuren) ---
    { typ: 'baum', x: 0, y: 3, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum_herbst', x: 0, y: 12, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum', x: 0, y: 20, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum', x: 0.2, y: 27.5, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum_herbst', x: 60.3, y: 5, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum', x: 60.3, y: 15, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum', x: 60.3, y: 28, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum', x: 1, y: 35, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'baum_herbst', x: 1.5, y: 38.5, b: 3, h: 3, ebene: 'oben' },
    { typ: 'baum', x: 59, y: 35.5, b: 3.5, h: 3.5, ebene: 'oben' },
    { typ: 'busch', x: 15, y: 32, b: 1.6, h: 1.6, ebene: 'oben' },
    { typ: 'busch', x: 20, y: 32.2, b: 1.4, h: 1.4, ebene: 'oben' },
    { typ: 'busch', x: 40, y: 32, b: 1.6, h: 1.6, ebene: 'oben' },
    { typ: 'busch', x: 46, y: 32.2, b: 1.4, h: 1.4, ebene: 'oben' },
    { typ: 'busch', x: 52, y: 32, b: 1.6, h: 1.6, ebene: 'oben' },
    // --- Licht: Notbeleuchtung (Strom ist weg …) und Straßenlaternen ---
    { typ: 'licht', x: 11, y: 13, b: 1, h: 1, radius: 3.5, farbe: '#ff3b2f', staerke: 0.55, flackern: true },
    { typ: 'licht', x: 31, y: 13, b: 1, h: 1, radius: 3.5, farbe: '#ff3b2f', staerke: 0.55 },
    { typ: 'licht', x: 51, y: 13, b: 1, h: 1, radius: 3.5, farbe: '#ff3b2f', staerke: 0.55, flackern: true },
    { typ: 'licht', x: 31, y: 19, b: 1, h: 1, radius: 3, farbe: '#46ff8a', staerke: 0.45 },
    { typ: 'licht', x: 38, y: 26, b: 1, h: 1, radius: 5, farbe: '#bfe4ff', staerke: 0.7, flackern: true },
    { typ: 'licht', x: 40, y: 18, b: 1, h: 1, radius: 3.5, farbe: '#ffc46b', staerke: 0.5 },
    { typ: 'licht', x: 12, y: 27, b: 1, h: 1, radius: 3, farbe: '#ff3b2f', staerke: 0.5, flackern: true },
    { typ: 'licht', x: 13, y: 37, b: 1, h: 1, radius: 6, farbe: '#ffb35c', staerke: 0.8 },
    { typ: 'licht', x: 31, y: 33, b: 1, h: 1, radius: 5, farbe: '#ffb35c', staerke: 0.75 },
    { typ: 'licht', x: 51, y: 37, b: 1, h: 1, radius: 6, farbe: '#ffb35c', staerke: 0.8, flackern: true },
    // --- Parkplatz & Straße ---
    ...parkplatz({
      // Bucht 3 und 4 bleiben frei: Weg vom Spawn zum Haupteingang
      belegtOben: { 0: 'auto_rot', 1: 'auto_gruen', 2: 'auto_schwarz', 5: 'transporter', 6: 'auto_gelb' },
      belegtUnten: { 0: 'auto_blau', 4: 'auto_schwarz', 6: 'auto_rot' },
    }),
    { typ: 'oelfleck', x: 22, y: 38.5, b: 1.6, h: 1.4, ebene: 'boden' },
    { typ: 'blutlache', x: 44, y: 37.4, b: 1.4, h: 1.4, ebene: 'boden' },
    { typ: 'auto_blau', x: 19, y: 42.6, b: 5.5, h: 3, drehung: 80, ...M },
    { typ: 'pylone', x: 26, y: 43.2, b: 0.8, h: 0.8 },
    { typ: 'pylone', x: 27.3, y: 44, b: 0.8, h: 0.8 },
    { typ: 'fass', x: 8.2, y: 32.1, b: 0.9, h: 0.9, ...M },
    { typ: 'pylone', x: 12.2, y: 32.3, b: 0.8, h: 0.8 },
  ],
};
