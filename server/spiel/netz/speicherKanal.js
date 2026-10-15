/**
 * Text-Kanal-Schnittstelle (so sieht JEDE Verbindung für den SpielServer aus):
 *
 *   kanal.senden(text)          Text an die Gegenseite schicken
 *   kanal.beiNachricht(fn)      fn(text) bei eingehendem Text
 *   kanal.beiTrennung(fn)       fn(grund) einmalig, wenn die Verbindung endet
 *   kanal.trennen(grund)        Verbindung beenden
 *
 * Implementierungen:
 *   - server/node/websocketAnbindung.js   echter WebSocket (Mehrspieler)
 *   - dieser Speicher-Kanal               Client & Server im selben Browser-Tab (Lokal-Modus, Tests)
 *
 * Der Speicher-Kanal stellt Nachrichten asynchron (setTimeout) zu – wie ein echtes Netzwerk.
 * Mit latenzMs lässt sich Lag simulieren, um Vorhersage/Interpolation zu testen.
 */
export function erstelleSpeicherKanalPaar({ latenzMs = 0 } = {}) {
  const a = { nachrichtHoerer: [], trennHoerer: [] };
  const b = { nachrichtHoerer: [], trennHoerer: [] };
  let offen = true;

  function trennen(grund) {
    if (!offen) return;
    offen = false;
    for (const seite of [a, b]) for (const hoerer of seite.trennHoerer) hoerer(grund);
  }

  function erzeugeEnde(eigene, gegenseite) {
    return {
      senden(text) {
        if (!offen) return;
        const kopie = String(text);
        setTimeout(() => {
          if (offen) for (const hoerer of gegenseite.nachrichtHoerer) hoerer(kopie);
        }, latenzMs);
      },
      beiNachricht(hoerer) {
        eigene.nachrichtHoerer.push(hoerer);
      },
      beiTrennung(hoerer) {
        eigene.trennHoerer.push(hoerer);
      },
      trennen(grund = 'Verbindung getrennt') {
        trennen(grund);
      },
    };
  }

  return { clientSeite: erzeugeEnde(a, b), serverSeite: erzeugeEnde(b, a) };
}
