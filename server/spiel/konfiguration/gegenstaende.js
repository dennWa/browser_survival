import { STAPEL_MUNITION, STAPEL_STANDARD } from '../../../gemeinsam/konstanten.js';

/**
 * Gegenstands-Definitionen (Item-Datenbank).
 * Schlüssel = defId (muss zu einem Icon in client/assets/atlas.json → items.icons passen; ein Test prüft das).
 * Kategorien: nahrung, getraenk, medizin, nahkampf, fernkampf, munition, material, rucksack, kleidung, bauwerk, werkzeug, samen,
 *   Runde 24: mod (Waffen-Aufsätze), wurf (Rohrbombe, Molotow – kampfSystem → explosionSystem.werfe).
 * Kleidung: slot (kopf|oberkoerper|haende|beine|fuesse), waerme (gegen Kälte), plaetze (Taschen), farbe (Optik am Charakter),
 *   Runde 24: schutz (% weniger Schaden, Summe ≤ RUESTUNG_MAX), regenschutz (0..1 weniger Kälte durch Niederschlag);
 * Icons selbst gezeichnet in werkzeuge/assets/baue_assets.py (prozedural 'kleidung:<form>:<farbe>').
 *
 * ausruestung = Haltung/Waffenart (taschenlampe | messer | pistole | schrotflinte | gewehr)
 * Runde 24 – Waffenwerte: haltbarkeit (Nahkampf nutzt sich pro Treffer ab, Reparatur an der Werkbank: `reparatur` = Kosten),
 *   rueckstoss (Faktor), durchschlag (0..1 gegen Panzer), kegel (± rad Trefferkegel, Standard NAHKAMPF_KEGEL),
 *   laerm (Faktor auf den Hör-Radius der Zombies; Bogen/Armbrust leise), pfeil (Geschoss bleibt mit `bergen`-Chance liegen),
 *   mods (erlaubte Aufsätze: zielfernrohr | magazin | schalldaempfer – Item-Kategorie 'mod', Werte in MODS)
 * (inHand: true = lässt sich ausrüsten, ohne Waffe zu sein – Angel, Samen)
 * werkzeug    = Werkzeug zum Abbauen (Axt → Bäume, Spitzhacke → Steine; siehe gemeinsam/welt/ressourcen.js)
 *
 * Werte lassen sich ingame im Developer-Modus ändern (Admin-Menü → Developer).
 * Neue Items: Icon in werkzeuge/assets/baue_assets.py (ITEMS) eintragen.
 */
const ROH_GEGENSTAENDE = {
  // --- Essen ---
  konservendose: { name: 'Konservendose', kategorie: 'nahrung', naehrwert: 35, stapelbar: 5 },
  marmelade: { name: 'Glas Marmelade', kategorie: 'nahrung', naehrwert: 20, stapelbar: 5 },
  apfel: { name: 'Äpfel', kategorie: 'nahrung', naehrwert: 12, durstwert: 4, stapelbar: 5 },
  broetchen: { name: 'Brötchen', kategorie: 'nahrung', naehrwert: 15, stapelbar: 5 },
  kaese: { name: 'Käse', kategorie: 'nahrung', naehrwert: 20, stapelbar: 5 },
  muesliriegel: { name: 'Müsliriegel', kategorie: 'nahrung', naehrwert: 15, stapelbar: 10 },
  sandwich: { name: 'Sandwich', kategorie: 'nahrung', naehrwert: 30, stapelbar: 3 },
  // Obst & Gemüse löschen nebenbei etwas Durst (durstwert ≈ ⅓ naehrwert; Gurke bewusst 1:1)
  // Ernte vom Beet – am Lagerfeuer gebraten/gebacken machen sie 30 % mehr satt (gemeinsam/welt/bauwerke.js → KOCHBAR)
  tomate: { name: 'Tomate', kategorie: 'nahrung', naehrwert: 12, durstwert: 4, stapelbar: 10, beschreibung: 'Am Lagerfeuer braten: macht 30 % mehr satt' },
  gurke: { name: 'Gurke', kategorie: 'nahrung', naehrwert: 12, durstwert: 12, stapelbar: 10, beschreibung: 'Am Lagerfeuer braten: macht 30 % mehr satt' },
  kartoffel: { name: 'Kartoffel', kategorie: 'nahrung', naehrwert: 14, durstwert: 5, stapelbar: 10, beschreibung: 'Am Lagerfeuer backen: macht 30 % mehr satt' },
  tomate_gebraten: { name: 'Gebratene Tomate', kategorie: 'nahrung', naehrwert: 16, durstwert: 5, stapelbar: 10 },
  gurke_gebraten: { name: 'Gebratene Gurke', kategorie: 'nahrung', naehrwert: 16, durstwert: 16, stapelbar: 10 },
  ofenkartoffel: { name: 'Ofenkartoffel', kategorie: 'nahrung', naehrwert: 18, durstwert: 6, stapelbar: 10 },
  // --- Trinken ---
  wasserflasche: { name: 'Wasserflasche', kategorie: 'getraenk', durstwert: 40, stapelbar: 5 },
  energydrink: { name: 'Energydrink', kategorie: 'getraenk', durstwert: 20, stapelbar: 5, boost: 5, beschreibung: '5 Sekunden Sprinten ohne Ausdauerverbrauch' },
  milch: { name: 'Milch', kategorie: 'getraenk', durstwert: 30, stapelbar: 3 },
  kaffee: { name: 'Kaffee', kategorie: 'getraenk', durstwert: 10, stapelbar: 3 },
  // --- Medizin ---
  verband: { name: 'Verband', kategorie: 'medizin', heilung: 15, stapelbar: 10 },
  schmerzmittel: { name: 'Schmerzmittel', kategorie: 'medizin', heilung: 25, stapelbar: 10 },
  erste_hilfe_kasten: { name: 'Erste-Hilfe-Kasten', kategorie: 'medizin', heilung: 60, stapelbar: 1 },
  // --- Nahkampf ---
  skalpell: { name: 'Skalpell', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 15, reichweite: 62, abklingzeit: 0.35 },
  kuechenmesser: { name: 'Küchenmesser', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 20, reichweite: 65, abklingzeit: 0.4 },
  hammer: { name: 'Hammer', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 30, reichweite: 70, abklingzeit: 0.7 },
  machete: { name: 'Machete', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 40, reichweite: 81, abklingzeit: 0.8, haltbarkeit: 70, reparatur: { stein: 2 } },
  feuerwehrbeil: { name: 'Feuerwehrbeil', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 50, reichweite: 81, abklingzeit: 1.0, haltbarkeit: 80, durchschlag: 0.3, reparatur: { holz: 1, stein: 2 } },
  // Runde 24: Nahkampf-Arsenal
  baseballschlaeger: { name: 'Baseballschläger', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 26, reichweite: 82, abklingzeit: 0.6, haltbarkeit: 90, rueckstoss: 2.6, beschreibung: 'Wuchtig: stößt Zombies weit zurück', reparatur: { holz: 2 } },
  brecheisen: { name: 'Brecheisen', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 30, reichweite: 74, abklingzeit: 0.7, haltbarkeit: 140, durchschlag: 0.7, beschreibung: 'Fast unkaputtbar, knackt Panzerung', reparatur: { eisenbarren: 1 } },
  speer: { name: 'Speer', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 32, reichweite: 112, abklingzeit: 0.75, haltbarkeit: 45, kegel: 0.5, beschreibung: 'Große Reichweite, aber schmaler Stoß nach vorn', reparatur: { holz: 1, stein: 1 } },
  // --- Werkzeuge (auch als schwache Waffen nutzbar) ---
  axt: { name: 'Axt', kategorie: 'nahkampf', ausruestung: 'messer', werkzeug: true, schaden: 18, reichweite: 70, abklingzeit: 0.7, haltbarkeit: 40 },
  spitzhacke: { name: 'Spitzhacke', kategorie: 'nahkampf', ausruestung: 'messer', werkzeug: true, beschreibung: 'Steine und Eisenerz abbauen', schaden: 16, reichweite: 70, abklingzeit: 0.75, haltbarkeit: 40 },
  hacke: { name: 'Hacke', kategorie: 'nahkampf', ausruestung: 'hacke', werkzeug: true, beschreibung: 'In die Hand nehmen: Linksklick legt ein Ackerfeld an, Rechtsklick macht wieder Rasen daraus', schaden: 10, reichweite: 68, abklingzeit: 0.7, haltbarkeit: 30 },
  // --- Fernkampf ---
  pistole: { name: 'Pistole (9 mm)', kategorie: 'fernkampf', ausruestung: 'pistole', schaden: 25, munition: 'munition_9mm', magazin: 15, abklingzeit: 0.28, reichweite: 520, streuung: 0.03, nachladezeit: 1.1, mods: ['magazin', 'schalldaempfer'] },
  schrotflinte: { name: 'Schrotflinte (Kal. 12)', kategorie: 'fernkampf', ausruestung: 'schrotflinte', schaden: 16, projektile: 7, munition: 'munition_12', magazin: 5, abklingzeit: 0.85, reichweite: 280, streuung: 0.2, nachladezeit: 1.8, laerm: 1.3, mods: ['magazin'] },
  // Runde 24: Fernkampf
  gewehr: { name: 'Jagdgewehr', kategorie: 'fernkampf', ausruestung: 'schrotflinte', schaden: 75, munition: 'munition_gewehr', magazin: 5, abklingzeit: 1.1, reichweite: 900, streuung: 0.008, nachladezeit: 2.2, laerm: 1.6, durchschlag: 0.6, mods: ['zielfernrohr', 'magazin', 'schalldaempfer'], beschreibung: 'Weit und tödlich – aber laut' },
  bogen: { name: 'Bogen', kategorie: 'fernkampf', ausruestung: 'schrotflinte', schaden: 40, munition: 'pfeil', magazin: 1, abklingzeit: 0.5, reichweite: 600, streuung: 0.02, nachladezeit: 0.7, laerm: 0.12, pfeil: true, bergen: 0.6, beschreibung: 'Leise – Pfeile kann man oft wieder einsammeln' },
  armbrust: { name: 'Armbrust', kategorie: 'fernkampf', ausruestung: 'schrotflinte', schaden: 65, munition: 'bolzen', magazin: 1, abklingzeit: 0.4, reichweite: 700, streuung: 0.01, nachladezeit: 1.8, laerm: 0.18, pfeil: true, bergen: 0.5, durchschlag: 0.5, mods: ['zielfernrohr'], beschreibung: 'Leise und stark, langsames Spannen' },
  // --- Munition ---
  munition_9mm: { name: 'Munition 9 mm', kategorie: 'munition', stapelbar: 60, mengeBeimFund: [5, 15] },
  munition_12: { name: 'Schrotpatronen Kal. 12', kategorie: 'munition', stapelbar: 30, mengeBeimFund: [2, 6] },
  munition_gewehr: { name: 'Gewehrpatronen', kategorie: 'munition', mengeBeimFund: [2, 5] },
  pfeil: { name: 'Pfeile', kategorie: 'munition', mengeBeimFund: [3, 6], beschreibung: 'Für den Bogen – an der Werkbank selbst bauen' },
  bolzen: { name: 'Armbrustbolzen', kategorie: 'munition', mengeBeimFund: [2, 4] },
  // --- Waffen-Mods (Runde 24): mit der Waffe in der Hand „benutzen“ oder im Inventar auf die Waffe ziehen ---
  mod_zielfernrohr: { name: 'Zielfernrohr', kategorie: 'mod', mod: 'zielfernrohr', beschreibung: 'Aufsatz: +50 % Reichweite, viel genauer (Gewehr, Armbrust)' },
  mod_magazin: { name: 'Erweitertes Magazin', kategorie: 'mod', mod: 'magazin', beschreibung: 'Aufsatz: +60 % Magazin (Pistole, Gewehr, Schrotflinte)' },
  mod_schalldaempfer: { name: 'Schalldämpfer', kategorie: 'mod', mod: 'schalldaempfer', beschreibung: 'Aufsatz: Schüsse locken kaum Zombies an (Pistole, Gewehr)' },
  // --- Material (Abbau & Crafting) ---
  holz: { name: 'Holz', kategorie: 'material', stapelbar: 50, inHand: true, ausruestung: 'holz', beschreibung: 'In die Hand nehmen, Linksklick aufs Lagerfeuer: +3 Minuten Brenndauer' },
  stein: { name: 'Stein', kategorie: 'material', stapelbar: 50 },
  eisenerz: { name: 'Eisenerz', kategorie: 'material', stapelbar: 50, beschreibung: 'Mit der Spitzhacke abgebaut – für Fallen und Werkzeug' },
  eisenbarren: { name: 'Eisenbarren', kategorie: 'material', stapelbar: 50, beschreibung: 'Im Schmelzofen aus Eisenerz geschmolzen' },
  verkohlt: { name: 'Verkohltes Essen', kategorie: 'material', stapelbar: 10, beschreibung: 'Zu lange im Feuer – ungenießbar' },
  muell: { name: 'Müll', kategorie: 'material', stapelbar: 10, beschreibung: 'Aus dem See gefischt – nutzlos' },
  schrott: { name: 'Schrott', kategorie: 'material', stapelbar: 10, beschreibung: 'Rostiges Metall aus dem See' },
  bretter: { name: 'Bretter', kategorie: 'material', stapelbar: 10, beschreibung: 'Vor einer geschlossenen Tür benutzen: verstärkt sie' },
  // Rucksäcke: werden beim Aufheben angelegt (falls man noch keinen trägt) → `plaetze` zusätzliche Inventarplätze.
  // Trägt man schon einen: im Inventar "benutzen" = tauschen (Inhalt wandert mit)
  rucksack_klein: { name: 'Kleiner Rucksack', kategorie: 'rucksack', plaetze: 4, beschreibung: 'Anlegen: +4 Inventarplätze' },
  rucksack: { name: 'Rucksack', kategorie: 'rucksack', plaetze: 6, beschreibung: 'Anlegen: +6 Inventarplätze' },
  rucksack_gross: { name: 'Großer Rucksack', kategorie: 'rucksack', plaetze: 8, beschreibung: 'Anlegen: +8 Inventarplätze' },
  // --- Kleidung (Runde 23): am Charakter anziehen (Inventar links, Slot = slot) – nur Wärme gegen Unterkühlung + Taschen (plaetze) ---
  muetze: { name: 'Wollmütze', kategorie: 'kleidung', slot: 'kopf', waerme: 10, farbe: '#8a2f2f' },
  kapuzenpulli: { name: 'Kapuzenpulli', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 15, plaetze: 1, farbe: '#4f5f70' },
  winterjacke: { name: 'Winterjacke', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 32, plaetze: 2, farbe: '#2e4a6e' },
  arbeitsweste: { name: 'Arbeitsweste', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 6, plaetze: 4, farbe: '#c8782a' },
  handschuhe: { name: 'Handschuhe', kategorie: 'kleidung', slot: 'haende', waerme: 8, farbe: '#33302c' },
  jeans: { name: 'Jeans', kategorie: 'kleidung', slot: 'beine', waerme: 8, plaetze: 2, farbe: '#3d4f78' },
  thermohose: { name: 'Thermohose', kategorie: 'kleidung', slot: 'beine', waerme: 18, plaetze: 1, farbe: '#26272c' },
  stiefel: { name: 'Winterstiefel', kategorie: 'kleidung', slot: 'fuesse', waerme: 12, farbe: '#5a3c22' },
  turnschuhe: { name: 'Turnschuhe', kategorie: 'kleidung', slot: 'fuesse', waerme: 3, farbe: '#d8d8d8' },
  // Runde 24: Rüstung (schutz = % weniger Schaden, Summe gedeckelt) und Regenschutz (0..1: Kälte durch Regen/Schnee sinkt)
  lederjacke: { name: 'Lederjacke', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 14, schutz: 10, plaetze: 1, farbe: '#4a3020' },
  schutzweste: { name: 'Schutzweste', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 4, schutz: 30, plaetze: 2, farbe: '#2f3a2a' },
  regenmantel: { name: 'Regenmantel', kategorie: 'kleidung', slot: 'oberkoerper', waerme: 10, regenschutz: 0.8, farbe: '#d8b020' },
  helm: { name: 'Bauhelm', kategorie: 'kleidung', slot: 'kopf', waerme: 2, schutz: 12, farbe: '#e0a020' },
  motorradhelm: { name: 'Motorradhelm', kategorie: 'kleidung', slot: 'kopf', waerme: 6, schutz: 20, regenschutz: 0.2, farbe: '#1f1f24' },
  kampfhose: { name: 'Cargohose mit Polstern', kategorie: 'kleidung', slot: 'beine', waerme: 10, schutz: 8, plaetze: 3, farbe: '#4b5236' },
  gummistiefel: { name: 'Gummistiefel', kategorie: 'kleidung', slot: 'fuesse', waerme: 6, regenschutz: 0.3, farbe: '#3c5a2c' },
  lederhandschuhe: { name: 'Lederhandschuhe', kategorie: 'kleidung', slot: 'haende', waerme: 6, schutz: 5, farbe: '#5a3a22' },
  // --- Bauwerke: benutzen → Vorschau, dann in die Welt setzen (gemeinsam/welt/bauwerke.js) ---
  werkbank: { name: 'Werkbank', kategorie: 'bauwerk', bauwerk: 'werkbank', beschreibung: 'Aufstellen und Werkzeug, Waffen & Fallen bauen' },
  lagerfeuer: { name: 'Lagerfeuer', kategorie: 'bauwerk', bauwerk: 'lagerfeuer', beschreibung: 'Draußen aufstellen, mit F und Feuerzeug anzünden, Essen braten' },
  schmelzofen: { name: 'Schmelzofen', kategorie: 'bauwerk', bauwerk: 'schmelzofen', beschreibung: 'Aufstellen, Holz als Brennstoff und Eisenerz hineinlegen: ergibt Eisenbarren' },
  falle: { name: 'Bärenfalle', kategorie: 'bauwerk', bauwerk: 'falle', stapelbar: 3, beschreibung: 'Auf den Boden legen – tritt ein Zombie hinein, ist er sofort tot' },
  // Runde 24: Fallen für die Basis (systeme/fallenSystem.js)
  sprengfalle: { name: 'Sprengfalle', kategorie: 'bauwerk', bauwerk: 'sprengfalle', beschreibung: 'Explodiert, wenn ein Zombie drauftritt (verletzt auch dich!)' },
  stacheldraht: { name: 'Stacheldraht', kategorie: 'bauwerk', bauwerk: 'stacheldraht', beschreibung: 'Zombies kommen nur langsam durch und verletzen sich – nutzt sich ab' },
  fallgrube: { name: 'Fallgrube (Bausatz)', kategorie: 'bauwerk', bauwerk: 'fallgrube', beschreibung: 'Grube mit Pfählen: Zombies stecken fest und verletzen sich' },
  dosenalarm: { name: 'Dosenalarm', kategorie: 'bauwerk', bauwerk: 'dosenalarm', beschreibung: 'Klappert, wenn Zombies vorbeikommen – du bekommst eine Meldung' },
  // Runde 24: Wurfwaffen (in die Hand nehmen, Linksklick wirft dorthin, wo die Maus zeigt)
  granate: { name: 'Rohrbombe', kategorie: 'wurf', wurf: 'granate', inHand: true, ausruestung: 'wurf', wurfweite: 320, zuender: 1, sprengRadius: 105, sprengSchaden: 80, beschreibung: 'Werfen (Linksklick): explodiert nach 1 Sekunde' },
  molotow: { name: 'Molotowcocktail', kategorie: 'wurf', wurf: 'molotow', inHand: true, ausruestung: 'wurf', wurfweite: 300, brandRadius: 64, brandDauer: 9, brandSchaden: 14, beschreibung: 'Werfen (Linksklick): setzt den Boden 9 Sekunden in Brand' },
  schwarzpulver: { name: 'Schwarzpulver', kategorie: 'material', beschreibung: 'Aus Kohle (verkohltes Essen) und Stein – für Sprengstoff' },
  huhn: { name: 'Huhn', kategorie: 'material', beschreibung: 'Eingefangenes Huhn – für einen Hühnerstall (Bau-Menü → Farm)' },
  benzin: { name: 'Benzinkanister', kategorie: 'material', beschreibung: 'Treibstoff für den Generator (15 min Strom)' },
  alkohol: { name: 'Hochprozentiges', kategorie: 'material', beschreibung: 'Brennt gut – für Molotowcocktails' },
  // --- Werkzeug & Garten ---
  feuerzeug: { name: 'Feuerzeug', kategorie: 'werkzeug', beschreibung: 'Zum Anzünden von Lagerfeuern (F)' },
  samen_tomate: { name: 'Tomatensamen', kategorie: 'samen', pflanze: 'tomate', stapelbar: 10, beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_gurke: { name: 'Gurkensamen', kategorie: 'samen', pflanze: 'gurke', stapelbar: 10, beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_kartoffel: { name: 'Saatkartoffeln', kategorie: 'samen', pflanze: 'kartoffel', stapelbar: 10, beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_paprika: { name: 'Paprikasamen', kategorie: 'samen', pflanze: 'paprika', beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  paprika: { name: 'Paprika', kategorie: 'nahrung', naehrwert: 13, durstwert: 4, beschreibung: 'Am Lagerfeuer braten: macht 30 % mehr satt' },
  paprika_gebraten: { name: 'Gebratene Paprika', kategorie: 'nahrung', naehrwert: 17, durstwert: 6 },
  // Runde 24: Farm
  samen_weizen: { name: 'Weizenkörner', kategorie: 'samen', pflanze: 'weizen', beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_karotte: { name: 'Karottensamen', kategorie: 'samen', pflanze: 'karotte', beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_kuerbis: { name: 'Kürbiskerne', kategorie: 'samen', pflanze: 'kuerbis', beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  samen_erdbeere: { name: 'Erdbeersamen', kategorie: 'samen', pflanze: 'erdbeere', beschreibung: 'In ein Beet pflanzen (E am Beet)' },
  weizen: { name: 'Weizen', kategorie: 'material', beschreibung: 'Zu Mehl mahlen – für Brot (Werkbank/Kochstelle)' },
  karotte: { name: 'Karotte', kategorie: 'nahrung', naehrwert: 11, durstwert: 4 },
  karotte_gebraten: { name: 'Gebratene Karotte', kategorie: 'nahrung', naehrwert: 15, durstwert: 5 },
  kuerbis: { name: 'Kürbis', kategorie: 'nahrung', naehrwert: 24, durstwert: 8, beschreibung: 'Am Feuer backen: noch sättigender' },
  kuerbis_gebraten: { name: 'Ofenkürbis', kategorie: 'nahrung', naehrwert: 32, durstwert: 8 },
  erdbeere: { name: 'Erdbeeren', kategorie: 'nahrung', naehrwert: 8, durstwert: 5 },
  ei: { name: 'Ei', kategorie: 'nahrung', naehrwert: 6, beschreibung: 'Roh geht – gebraten (Lagerfeuer) ist besser' },
  spiegelei: { name: 'Spiegelei', kategorie: 'nahrung', naehrwert: 20 },
  honig: { name: 'Honig', kategorie: 'nahrung', naehrwert: 16, beschreibung: 'Süß und hält ewig' },
  // --- Jagen & Angeln ---
  fleisch: { name: 'Hasenfleisch', kategorie: 'nahrung', naehrwert: 14, beschreibung: 'Am Lagerfeuer braten: macht deutlich satter' },
  fleisch_gebraten: { name: 'Hasenbraten', kategorie: 'nahrung', naehrwert: 32 },
  fisch_barsch: { name: 'Barsch', kategorie: 'nahrung', naehrwert: 12, beschreibung: 'Am Lagerfeuer braten' },
  fisch_forelle: { name: 'Forelle', kategorie: 'nahrung', naehrwert: 16, beschreibung: 'Am Lagerfeuer braten' },
  fisch_hecht: { name: 'Hecht', kategorie: 'nahrung', naehrwert: 22, beschreibung: 'Am Lagerfeuer braten' },
  fisch_barsch_gebraten: { name: 'Gebratener Barsch', kategorie: 'nahrung', naehrwert: 24 },
  fisch_forelle_gebraten: { name: 'Gebratene Forelle', kategorie: 'nahrung', naehrwert: 30 },
  fisch_hecht_gebraten: { name: 'Gebratener Hecht', kategorie: 'nahrung', naehrwert: 40 },
  angel: { name: 'Angel', kategorie: 'werkzeug', inHand: true, ausruestung: 'angel', beschreibung: 'Am Ufer Linksklick: auswerfen – wackelt die Pose, nochmal klicken' },
  // Basisbau-Material (Teile & Kosten: gemeinsam/basisbau/teile.js)
  stoff: { name: 'Stoff', kategorie: 'material', mengeBeimFund: [1, 3], beschreibung: 'Für Betten – findest du in Wohnungen und Läden' },
};

/**
 * Stapelgrößen (einheitlich): Munition bis STAPEL_MUNITION, alles andere Stapelbare bis STAPEL_STANDARD.
 * Waffen, Werkzeuge und Rucksäcke bleiben einzeln (1).
 */
function normalisiere(roh) {
  const ergebnis = {};
  for (const [id, original] of Object.entries(roh)) {
    let def = original;
    const einzeln = ['nahkampf', 'fernkampf', 'rucksack', 'werkzeug', 'kleidung', 'mod'].includes(def.kategorie) || def.werkzeug === true || id === 'erste_hilfe_kasten';
    if (def.kategorie === 'kleidung') def = { ...def, beschreibung: `Anziehen (ins Charakterfeld ziehen oder anklicken): +${def.waerme} Wärme${def.schutz ? `, ${def.schutz} % Schutz` : ''}${def.regenschutz ? `, Regenschutz ${Math.round(def.regenschutz * 100)} %` : ''}${def.plaetze ? `, +${def.plaetze} Plätze` : ''}` };
    // Samen kann man in die Hand nehmen (Linksklick am Beet pflanzt)
    if (def.kategorie === 'samen') def = { ...def, inHand: true, ausruestung: 'samen' };
    // Essen, Trinken, Medizin: erst in die Hand nehmen (Zahlentaste), Linksklick verbraucht
    if (['nahrung', 'getraenk', 'medizin'].includes(def.kategorie)) def = { ...def, inHand: true, ausruestung: def.kategorie === 'getraenk' ? 'trinken' : 'essen' };
    ergebnis[id] = { ...def, stapelbar: def.kategorie === 'munition' ? STAPEL_MUNITION : einzeln ? 1 : STAPEL_STANDARD }; // nicht eingefroren: der Developer-Modus ändert Werte
  }
  return ergebnis;
}

export const GEGENSTAENDE = Object.freeze(normalisiere(ROH_GEGENSTAENDE));

/**
 * Runde 24: Waffen-Mods – wirken auf die Werte der Waffe (waffenWerte). Ein Mod je Art und Waffe; nur, wenn die Waffe ihn in `mods` erlaubt.
 */
export const MODS = Object.freeze({
  zielfernrohr: { item: 'mod_zielfernrohr', reichweite: 1.5, streuung: 0.35 },
  magazin: { item: 'mod_magazin', magazin: 1.6 },
  schalldaempfer: { item: 'mod_schalldaempfer', laerm: 0.25, schaden: 0.9 },
});

/** Werte einer Waffe samt angebrachter Mods (eintrag.mods) – überall nutzen, wo Magazin/Reichweite/Lärm zählen. */
export function waffenWerte(eintrag, def) {
  const mods = eintrag?.mods;
  if (!mods?.length || !def) return def;
  const w = { ...def };
  for (const name of mods) {
    const m = MODS[name];
    if (!m || !def.mods?.includes(name)) continue;
    if (m.reichweite) w.reichweite = Math.round(w.reichweite * m.reichweite);
    if (m.streuung) w.streuung = (w.streuung ?? 0) * m.streuung;
    if (m.magazin) w.magazin = Math.round(w.magazin * m.magazin);
    if (m.laerm) w.laerm = (w.laerm ?? 1) * m.laerm;
    if (m.schaden) w.schaden = w.schaden * m.schaden;
  }
  return w;
}

/** Ausrüstung ohne Waffe in der Hand. */
export const STANDARD_AUSRUESTUNG = 'taschenlampe';

/** Angriff ohne ausgerüstete Waffe: Faustschlag – geht immer, macht aber kaum Schaden (Notlösung!). */
export const UNBEWAFFNET = Object.freeze({
  name: 'Faust', kategorie: 'nahkampf', ausruestung: STANDARD_AUSRUESTUNG, schaden: 5, reichweite: 57, abklingzeit: 0.5,
});

/**
 * Öffnungswinkel (± Radiant) des Nahkampf-Trefferkegels vor der Figur.
 * Reichweite = Abstand bis zum RAND des Ziels. Zombies beißen ab ~42 px (Mitte zu Mitte) → Nahkampfwaffen
 * reichen bewusst weiter (Faust 44 = ~57 px Mitte zu Mitte), sonst hat man im Nahkampf keine Chance.
 */
export const NAHKAMPF_KEGEL = 1.3;
