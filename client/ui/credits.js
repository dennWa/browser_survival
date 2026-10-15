/**
 * Credits-Dialog: listet alle Grafikpakete mit Urheber und Lizenz (aus atlas.json).
 * Bei CC-BY-Grafiken ist diese Namensnennung rechtlich Pflicht – bitte nicht entfernen.
 */
export function zeigeCredits(dokument, assets) {
  const dialog = dokument.getElementById('credits');
  const liste = dokument.getElementById('credits-liste');
  liste.replaceChildren();
  for (const eintrag of assets?.lizenzen ?? []) {
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
