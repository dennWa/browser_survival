/**
 * Credits-Dialog: listet alle Grafikpakete mit Urheber und Lizenz (aus atlas.json) und die eigenen Modelle
 * (client/assets/eigene/credits.json – Einträge aus dem Ordner „!verteilen“, siehe KI_INDEX.md).
 * Bei CC-BY-Grafiken ist diese Namensnennung rechtlich Pflicht – bitte nicht entfernen.
 */
async function ladeEigeneCredits() {
  try {
    const antwort = await fetch(new URL('../assets/eigene/credits.json', import.meta.url));
    const liste = antwort.ok ? await antwort.json() : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

export async function zeigeCredits(dokument, assets) {
  const dialog = dokument.getElementById('credits');
  const liste = dokument.getElementById('credits-liste');
  liste.replaceChildren();
  const eigene = await ladeEigeneCredits();
  for (const eintrag of [...(assets?.lizenzen ?? []), ...eigene]) {
    const li = dokument.createElement('li');
    const link = dokument.createElement('a');
    link.href = eintrag.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = eintrag.paket;
    li.append(link, ` – ${eintrag.urheber} (${eintrag.lizenz})`);
    liste.append(li);
  }
  if (!liste.children.length) liste.append(Object.assign(dokument.createElement('li'), { textContent: 'Grafiken nicht geladen.' }));
  dialog.showModal();
}
