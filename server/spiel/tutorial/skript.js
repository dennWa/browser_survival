/**
 * Tutorial „Station 3“ – Ablauf als reine Daten (Konzept: TUTORIAL_KONZEPT.md). Hier Texte, Reihenfolge und Bedingungen ändern –
 * die Engine (server/spiel/systeme/tutorialSystem.js) liest nur diese Datei. Ein Test prüft alle Verweise (Items, Orte, Funkzeilen).
 *
 * Orte (punkte/bereiche/tueren) stehen in der Karte (server/spiel/karten/tutorial.js → `tutorial`), hier nur ihre Namen.
 *
 * KAPITEL: { titel, start (Punkt beim Kapitel-Sprung), sichere {defId: Mindestmenge beim Kapitelstart}, stunde (Uhrzeit, fest),
 *            schritte: [...] }
 * SCHRITT: { id, aufgaben: [{ text, taste: { pc, touch }, wenn: Bedingung }], ziel (Punkt/Bereich für den Marker),
 *            funk: [Zeilen-IDs beim Start], hilfe: Zeilen-ID (kommt nach HILFE_NACH s ohne Fortschritt), tipp: kurzer Hinweis,
 *            beiStart: [Aktionen], beiEnde: [Aktionen] }
 *   Alle Aufgaben eines Schritts müssen erledigt sein (jede bleibt erledigt, sobald sie einmal erfüllt war).
 *
 * BEDINGUNGEN: { bereich } · { hat: {defId: n} } · { inHand: defId } · { mindestens: { hunger|durst|leben: n } } · { ui: 'inventar'|'karte'|'skills' }
 *   · { ereignis: typ, anzahl?, wo?: { feld: wert } } (Spiel-Ereignisse dieses Schritts) · { kills: n } · { sprint: true } · { nachgeladen: true }
 *   · { skill: true } (Punkt verteilt) · { imAuto: true } · { bereich, imAuto: true } · { warte: Sekunden }
 * AKTIONEN: { boden: { defId, menge?, magazin?, punkt } } · { setze: { hunger, durst, leben } } · { oeffne: tuer } · { sperre: tuer }
 *   · { zombies: { punkt, variante?, anzahl?, gefesselt?, jagt? } } · { zombiesWeg: true } · { stunde: h } · { checkpoint: punkt }
 *   · { gib: { defId: n } } · { ende: true }
 */
export const HILFE_NACH = 25; // Sekunden ohne Fortschritt → Jelke hilft (Zeile `hilfe`)
export const HINWEIS_NACH = 60; // danach zeigt der Client „Esc → Kapitel überspringen“

/** Funkzeilen von Jelke (Leitstelle). Datei: client/audio/tutorial/<id>.ogg – fehlt sie, gibt es nur Untertitel. */
export const FUNK = {
  intro_1: 'Leitstelle an alle Stationen der Kreisklinik … Hört mich jemand?',
  intro_2: 'Zimmer zwölf, ich sehe Bewegung auf der Kamera. Hier ist Jelke. Wenn Sie mich hören: Bleiben Sie ruhig. Stehen Sie langsam auf.',
  k1_gut: 'Gut. Die Beine funktionieren. Das ist mehr, als ich von den meisten hier sagen kann.',
  k1_sprint: 'Und jetzt zur Tür. Rennen kostet Kraft – achten Sie auf Ihre Ausdauer.',
  k1_h: 'Bewegen Sie sich mit W, A, S, D. Die Maus bestimmt, wohin Sie schauen.',
  k2_essen: 'Sie waren lange weg. Auf dem Nachttisch liegen Wasser und ein Riegel. Nehmen Sie beides.',
  k2_inventar: 'Werfen Sie einen Blick in Ihre Taschen. Was Sie tragen, entscheidet ab jetzt über alles.',
  k2_trinken: 'Trinken Sie. Essen Sie. Hunger und Durst bringen Sie schneller um, als Sie denken.',
  k2_verband: 'Ihre Wunde blutet noch. Im Schwesternzimmer liegt Verbandszeug. Den Flur runter, die Türen öffnen von selbst.',
  k2_h: 'Gehen Sie nah ran und drücken Sie E. Die Schnellleiste füllt sich mit den Zahlentasten.',
  k3_hammer: 'Hören Sie mir jetzt genau zu. Im Hausmeisterraum ist einer von ihnen. Festgekettet. Nehmen Sie den Hammer neben der Tür.',
  k3_toeten: 'Das ist kein Patient mehr. Schlagen Sie zu. Zweimal reicht.',
  k3_gut: 'Gut gemacht. Mir ist auch schlecht. Weiter.',
  k3_h: 'Nehmen Sie den Hammer mit seiner Zahlentaste in die Hand. Dann Linksklick oder Leertaste.',
  k4_pistole: 'Der Sicherheitsdienst ist jetzt offen. Im Waffenschrank liegt eine Pistole. Sie werden sie brauchen.',
  k4_schiessen: 'Zielen Sie mit der Maus. Jeder Schuss ist laut – weit hörbar. Und hören tun hier inzwischen einige.',
  k4_nachladen: 'Magazin leer? Laden Sie nach, bevor Sie es brauchen. Nicht danach.',
  k4_h: 'Pistole in die Hand nehmen, auf das Ziel zeigen, Linksklick. R lädt nach.',
  k5_strom: 'Das war die Notstromversorgung. Verdammt. Ihre Taschenlampe ist an – mit L schalten Sie sie aus. Dunkel sieht man Sie schlechter.',
  k5_einer: 'Da ist einer im Flur der Notaufnahme. Langsam. Schwach. Nicht unterschätzen.',
  k5_mehr: 'Die Schüsse haben sie geweckt. Es kommen mehr. Halten Sie Abstand, zielen Sie ruhig.',
  k5_level: 'Sie lernen schnell. Jeder Sieg macht Sie stärker – verteilen Sie Ihren Punkt mit U.',
  k5_h: 'Rückwärts laufen, zielen, schießen. Wird es eng: Shift und weg.',
  k6_flucht: 'Im Flur ist eine ganze Gruppe. Kämpfen Sie nicht. Laufen Sie! Der Notausgang hinten ist jetzt offen!',
  k6_h: 'Halten Sie Shift gedrückt. Notausgang: hinterer Flur, ganz im Westen.',
  k6_draussen: 'Tür zu. Die kommen da so schnell nicht durch. Ruhen Sie sich aus … ich wecke Sie, wenn es hell wird.',
  k7_morgen: 'Guten Morgen. Draußen sind Sie nicht sicherer, nur freier. Am Schuppen liegen eine Axt und eine Spitzhacke.',
  k7_sammeln: 'Holz von den Bäumen, Stein von den Felsen. Stellen Sie sich davor und drücken Sie E.',
  k7_werkbank: 'Daraus bauen Sie eine Werkbank. Öffnen Sie das Inventar, Bereich Bauen.',
  k7_munition: 'An der Werkbank können Sie Munition gießen. Draußen wird sie knapp sein, glauben Sie mir.',
  k7_h: 'Werkbank aufstellen: Item benutzen, grüne Vorschau, Klick. Dann E an der Werkbank.',
  k8_feuer: 'Im Garten haben Sie Ruhe. Bauen Sie ein Lagerfeuer. Ein Feuerzeug liegt am Beet.',
  k8_anzuenden: 'Anzünden mit F. Feuer ist Wärme, Licht und warmes Essen.',
  k8_beet: 'Die Hacke liegt dort. Ein Beet anlegen, Samen setzen. In der echten Welt dauert das einen Tag. Hier, heute, nicht.',
  k8_ernten: 'Reif. Ernten Sie mit E – und braten Sie die Tomate am Feuer. Nicht anbrennen lassen.',
  k8_h: 'Hacke oder Samen in die Hand, auf die Erde zielen, Linksklick. Am Feuer E: Essen hineinlegen.',
  k9_alarm: 'Hören Sie das? Sie sind durchgebrochen. Laufen Sie zum Parkplatz! Der Krankenwagen – der Schlüssel steckt!',
  k9_fahren: 'Steigen Sie ein und fahren Sie. W gibt Gas, A und D lenken. Wer Ihnen im Weg steht, ist selbst schuld.',
  k9_h: 'Am Auto E zum Einsteigen. Die Ausfahrt ist im Osten.',
  ende: 'Gut. Sie sind draußen. Fahren Sie nach Süden, zum St.-Elisabeth. Dort sammeln wir … [Rauschen]',
  ohnmacht: 'Hey! Hey, wachen Sie auf! Noch mal. Und diesmal vorsichtiger.',
};

const T = (pc, touch) => ({ pc, touch });

export const KAPITEL = [
  {
    titel: 'Aufwachen',
    start: 'bett',
    stunde: 9,
    schritte: [
      {
        id: 'k1_gehen',
        funk: ['intro_1', 'intro_2'],
        aufgaben: [{ text: 'Steh auf und geh zum Fenster', taste: T('W A S D', 'Linker Stick'), wenn: { bereich: 'fenster' } }],
        ziel: 'fenster',
        hilfe: 'k1_h',
        beiStart: [{ setze: { leben: 70, hunger: 45, durst: 40 } }, { checkpoint: 'bett' }],
      },
      {
        id: 'k1_sprint',
        funk: ['k1_gut', 'k1_sprint'],
        aufgaben: [
          { text: 'Sprinte kurz', taste: T('Shift halten', 'Stick ganz raus'), wenn: { sprint: true } },
          { text: 'Geh zur Tür', taste: T('', ''), wenn: { bereich: 'zimmertuer' } },
        ],
        ziel: 'zimmertuer',
        hilfe: 'k1_h',
      },
    ],
  },
  {
    titel: 'Station 3',
    start: 'zimmertuer',
    stunde: 9.5,
    schritte: [
      {
        id: 'k2_aufheben',
        funk: ['k2_essen'],
        aufgaben: [
          { text: 'Heb die Wasserflasche auf', taste: T('E', '✋'), wenn: { hat: { wasserflasche: 1 } } },
          { text: 'Heb den Müsliriegel auf', taste: T('E', '✋'), wenn: { hat: { muesliriegel: 1 } } },
        ],
        ziel: 'nachttisch',
        hilfe: 'k2_h',
        beiStart: [{ boden: { defId: 'wasserflasche', punkt: 'nachttisch' } }, { boden: { defId: 'muesliriegel', punkt: 'nachttisch2' } }],
      },
      {
        id: 'k2_inventar',
        funk: ['k2_inventar'],
        aufgaben: [{ text: 'Öffne dein Inventar', taste: T('Tab', '🎒'), wenn: { ui: 'inventar' } }],
        tipp: 'Schnellleiste = die ersten 8 Plätze, Zahlentasten 1–8',
      },
      {
        id: 'k2_trinken',
        funk: ['k2_trinken'],
        aufgaben: [
          { text: 'Trink (Flasche in die Hand, Linksklick)', taste: T('Zahl + Linksklick', 'Platz antippen + 🎯'), wenn: { mindestens: { durst: 70 } } },
          { text: 'Iss den Riegel', taste: T('Zahl + Linksklick', 'Platz antippen + 🎯'), wenn: { mindestens: { hunger: 55 } } },
        ],
        tipp: 'Doppelklick im Inventar verbraucht ein Item direkt',
        hilfe: 'k2_h',
      },
      {
        id: 'k2_verband',
        funk: ['k2_verband'],
        aufgaben: [
          { text: 'Hol den Verband aus dem Schwesternzimmer', taste: T('E', '✋'), wenn: { hat: { verband: 1 } } },
          { text: 'Verbinde dich (Leben über 80)', taste: T('Zahl + Linksklick', '🎯'), wenn: { mindestens: { leben: 80 } } },
        ],
        ziel: 'verband',
        tipp: 'Karte: K · Minikarte oben rechts',
        beiStart: [{ boden: { defId: 'verband', punkt: 'verband' } }],
      },
    ],
  },
  {
    titel: 'Hausmeister',
    start: 'flur_west',
    stunde: 10,
    schritte: [
      {
        id: 'k3_hammer',
        funk: ['k3_hammer'],
        aufgaben: [
          { text: 'Nimm den Hammer', taste: T('E', '✋'), wenn: { hat: { hammer: 1 } } },
          { text: 'Nimm ihn in die Hand', taste: T('Zahlentaste', 'Platz antippen'), wenn: { inHand: 'hammer' } },
        ],
        ziel: 'hammer',
        hilfe: 'k3_h',
        beiStart: [{ oeffne: 'hausmeister' }, { boden: { defId: 'hammer', punkt: 'hammer' } }, { zombies: { punkt: 'kette', gefesselt: true } }],
      },
      {
        id: 'k3_schlagen',
        funk: ['k3_toeten'],
        aufgaben: [{ text: 'Erledige den Festgeketteten', taste: T('Linksklick / Leertaste', 'Rechter Stick'), wenn: { kills: 1 } }],
        ziel: 'kette',
        hilfe: 'k3_h',
        beiEnde: [{ funk: 'k3_gut' }],
      },
    ],
  },
  {
    titel: 'Sicherheitsdienst',
    start: 'flur_mitte',
    sichere: { hammer: 1 },
    stunde: 10.5,
    schritte: [
      {
        id: 'k4_pistole',
        funk: ['k4_pistole'],
        aufgaben: [
          { text: 'Nimm die Pistole aus dem Schrank', taste: T('E', '✋'), wenn: { hat: { pistole: 1 } } },
          { text: 'Nimm sie in die Hand', taste: T('Zahlentaste', 'Platz antippen'), wenn: { inHand: 'pistole' } },
        ],
        ziel: 'pistole',
        hilfe: 'k4_h',
        beiStart: [
          { oeffne: 'sicherheit' },
          { boden: { defId: 'pistole', magazin: 15, punkt: 'pistole' } },
          { boden: { defId: 'munition_9mm', menge: 30, punkt: 'pistole' } },
          { zombies: { punkt: 'schiessstand', gefesselt: true, anzahl: 2 } },
        ],
      },
      {
        id: 'k4_schiessen',
        funk: ['k4_schiessen'],
        aufgaben: [{ text: 'Erledige beide Festgebundenen', taste: T('Maus zielen + Linksklick', 'Rechter Stick'), wenn: { kills: 2 } }],
        ziel: 'schiessstand',
        hilfe: 'k4_h',
        tipp: 'Munition geht im Tutorial nie aus',
      },
      {
        id: 'k4_nachladen',
        funk: ['k4_nachladen'],
        aufgaben: [{ text: 'Lade nach', taste: T('R', '↻'), wenn: { nachgeladen: true } }],
        hilfe: 'k4_h',
      },
    ],
  },
  {
    titel: 'Stromausfall',
    start: 'flur_mitte',
    sichere: { pistole: 1, munition_9mm: 30 },
    stunde: 22,
    schritte: [
      {
        id: 'k5_hinein',
        funk: ['k5_strom'],
        aufgaben: [{ text: 'Geh in die Notaufnahme', taste: T('', ''), wenn: { bereich: 'notaufnahme' } }],
        ziel: 'notaufnahme',
        tipp: 'Taschenlampe an/aus: L (🔦) – aus = Zombies sehen dich schlechter',
        beiStart: [{ oeffne: 'notaufnahme' }, { checkpoint: 'flur_mitte' }],
      },
      {
        id: 'k5_einer',
        funk: ['k5_einer'],
        aufgaben: [{ text: 'Erledige den Zombie', taste: T('Linksklick', 'Rechter Stick'), wenn: { kills: 1 } }],
        hilfe: 'k5_h',
        beiStart: [{ zombies: { punkt: 'notaufnahme_ost', variante: 'halb', jagt: true } }],
      },
      {
        id: 'k5_mehr',
        funk: ['k5_mehr'],
        aufgaben: [{ text: 'Erledige die beiden anderen', taste: T('Linksklick', 'Rechter Stick'), wenn: { kills: 2 } }],
        hilfe: 'k5_h',
        tipp: 'Rennen: Shift · Abstand halten, dann schießen',
        beiStart: [{ zombies: { punkt: 'notaufnahme_ost', variante: 'normal', anzahl: 1, jagt: true } }, { zombies: { punkt: 'notaufnahme_west', variante: 'laeufer', jagt: true } }],
      },
      {
        id: 'k5_skill',
        funk: ['k5_level'],
        aufgaben: [{ text: 'Verteile deinen Skillpunkt', taste: T('U', '⭐'), wenn: { skill: true } }],
        beiStart: [{ levelMindestens: 2 }],
      },
    ],
  },
  {
    titel: 'Flucht',
    start: 'notaufnahme',
    sichere: { pistole: 1, munition_9mm: 30 },
    stunde: 22.5,
    schritte: [
      {
        id: 'k6_flucht',
        funk: ['k6_flucht'],
        aufgaben: [{ text: 'Renn zum Notausgang!', taste: T('Shift halten', 'Stick ganz raus'), wenn: { bereich: 'hinterhof' } }],
        ziel: 'notausgang',
        hilfe: 'k6_h',
        beiStart: [{ oeffne: 'notausgang' }, { zombies: { punkt: 'flur_ost', variante: 'normal', anzahl: 4, jagt: true } }],
        beiEnde: [{ sperre: 'notausgang' }, { zombiesWeg: true }],
      },
    ],
  },
  {
    titel: 'Hinterhof',
    start: 'hof_start',
    sichere: { pistole: 1, munition_9mm: 30 },
    stunde: 7,
    schritte: [
      {
        id: 'k7_werkzeug',
        funk: ['k6_draussen', 'k7_morgen'],
        aufgaben: [
          { text: 'Nimm die Axt', taste: T('E', '✋'), wenn: { hat: { axt: 1 } } },
          { text: 'Nimm die Spitzhacke', taste: T('E', '✋'), wenn: { hat: { spitzhacke: 1 } } },
        ],
        ziel: 'schuppen',
        beiStart: [{ checkpoint: 'hof_start' }, { boden: { defId: 'axt', punkt: 'schuppen' } }, { boden: { defId: 'spitzhacke', punkt: 'schuppen' } }],
      },
      {
        id: 'k7_sammeln',
        funk: ['k7_sammeln'],
        aufgaben: [
          { text: 'Fälle Bäume: 6 Holz', taste: T('E am Baum', '✋'), wenn: { hat: { holz: 6 } } },
          { text: 'Bau Steine ab: 3 Stein', taste: T('E am Stein', '✋'), wenn: { hat: { stein: 3 } } },
        ],
        ziel: 'baeume',
        tipp: 'Werkzeug muss nur im Inventar sein · der Balken zeigt die Haltbarkeit',
        hilfe: 'k7_sammeln',
      },
      {
        id: 'k7_werkbank',
        funk: ['k7_werkbank'],
        aufgaben: [
          { text: 'Stell im Inventar eine Werkbank her', taste: T('Tab → Bauen', '🎒 → Bauen'), wenn: { hat: { werkbank: 1 } } },
          { text: 'Stell sie im Hof auf', taste: T('Item benutzen + Klick', 'Antippen + ✓'), wenn: { ereignis: 'gebaut', wo: { bauwerk: 'werkbank' } } },
        ],
        hilfe: 'k7_h',
      },
      {
        id: 'k7_munition',
        funk: ['k7_munition'],
        aufgaben: [{ text: 'Gieß an der Werkbank Munition', taste: T('E an der Werkbank', '✋'), wenn: { ereignis: 'hergestellt', wo: { rezept: 'munition_9mm' } } }],
        hilfe: 'k7_h',
        beiEnde: [{ oeffne: 'gartentor' }],
      },
    ],
  },
  {
    titel: 'Garten',
    start: 'garten',
    sichere: { holz: 3, axt: 1, spitzhacke: 1 },
    stunde: 8,
    schritte: [
      {
        id: 'k8_feuer',
        funk: ['k8_feuer'],
        aufgaben: [
          { text: 'Bau ein Lagerfeuer und stell es auf', taste: T('Tab → Bauen', '🎒 → Bauen'), wenn: { ereignis: 'gebaut', wo: { bauwerk: 'lagerfeuer' } } },
          { text: 'Nimm das Feuerzeug', taste: T('E', '✋'), wenn: { hat: { feuerzeug: 1 } } },
        ],
        ziel: 'garten',
        beiStart: [{ oeffne: 'gartentor' }, { checkpoint: 'garten' }, { boden: { defId: 'feuerzeug', punkt: 'beet' } }, { boden: { defId: 'hacke', punkt: 'beet' } }, { boden: { defId: 'samen_tomate', menge: 2, punkt: 'beet' } }],
      },
      {
        id: 'k8_anzuenden',
        funk: ['k8_anzuenden'],
        aufgaben: [{ text: 'Zünde das Feuer an', taste: T('F', '🔥'), wenn: { ereignis: 'lagerfeuer', wo: { an: true } } }],
        hilfe: 'k8_anzuenden',
      },
      {
        id: 'k8_beet',
        funk: ['k8_beet'],
        aufgaben: [
          { text: 'Leg mit der Hacke ein Beet an', taste: T('Hacke in die Hand + Linksklick', 'Hacke + 🎯'), wenn: { ereignis: 'gebaut', wo: { bauwerk: 'beet' } } },
          { text: 'Pflanze die Tomatensamen', taste: T('Samen in die Hand + Linksklick', 'Samen + 🎯'), wenn: { ereignis: 'gepflanzt' } },
        ],
        ziel: 'beet',
        hilfe: 'k8_h',
        tipp: 'Rechtsklick mit der Hacke macht wieder Rasen daraus',
      },
      {
        id: 'k8_ernten',
        funk: ['k8_ernten'],
        aufgaben: [
          { text: 'Ernte die Tomate, sobald sie reif ist', taste: T('E am Beet', '✋'), wenn: { ereignis: 'geerntet' } },
          { text: 'Brate sie am Lagerfeuer', taste: T('E am Feuer', '✋'), wenn: { ereignis: 'gekocht' } },
        ],
        hilfe: 'k8_h',
        tipp: 'Hinsetzen: Ä · am brennenden Feuer heilt man',
      },
    ],
  },
  {
    titel: 'Aufbruch',
    start: 'garten',
    sichere: { pistole: 1, munition_9mm: 30 },
    stunde: 19,
    schritte: [
      {
        id: 'k9_laufen',
        funk: ['k9_alarm'],
        aufgaben: [{ text: 'Lauf zum Krankenwagen!', taste: T('Shift', 'Stick ganz raus'), wenn: { bereich: 'parkplatz' } }],
        ziel: 'auto',
        hilfe: 'k9_h',
        beiStart: [{ oeffne: 'hoftor' }, { checkpoint: 'garten' }, { zombies: { punkt: 'horde_west', anzahl: 4, jagt: true } }, { zombies: { punkt: 'horde_sued', anzahl: 4, jagt: true } }],
      },
      {
        id: 'k9_fahren',
        funk: ['k9_fahren'],
        aufgaben: [
          { text: 'Steig ein', taste: T('E', '🚗'), wenn: { imAuto: true } },
          { text: 'Fahr zur Ausfahrt', taste: T('W A S D', 'Linker Stick'), wenn: { bereich: 'ausfahrt', imAuto: true } },
        ],
        ziel: 'ausfahrt',
        hilfe: 'k9_h',
        tipp: 'Kofferraum: G (oder Tab hinter dem Auto)',
        beiEnde: [{ funk: 'ende' }, { ende: true }],
      },
    ],
  },
];
