/**
 * Runde 28: Rauchtest-Helfer fürs Hauptmenü (client/ui/hauptmenue.js).
 *   singleplayerStarten(seite, name)  → Singleplayer → Slot (leer: Charakter erstellen, sonst „Neu erstellen“) → Name → Laden
 *   multiplayerGast(seite, serverName) → Multiplayer → Server → Gast → Charakter erstellen → Laden
 * Wartet NICHT auf das Ende des Ladebildschirms (das macht der Test selbst).
 */
export async function hauptmenueAbwarten(seite, timeout = 60000) {
  await seite.waitForSelector('#hauptmenue:not([hidden])', { timeout });
}

export async function singleplayerStarten(seite, name, slot = 1) {
  await seite.click('#hm-singleplayer');
  const karte = seite.locator('.hm-slot').nth(slot - 1);
  await karte.waitFor();
  if (await karte.evaluate((k) => k.classList.contains('leer'))) await karte.locator('.hm-primaer').click();
  else {
    await karte.getByText('Neu erstellen').click();
    await seite.click('#hm-frage-ja');
  }
  await seite.fill('#ce-name', name);
  await seite.click('#ce-laden');
}

export async function multiplayerGast(seite, serverText = 'Dieser Server', name = `Gast_${Date.now() % 10000}`) {
  await seite.click('#hm-multiplayer');
  await seite.locator('.hm-server', { hasText: serverText }).first().click();
  await seite.click('.hm-umschalter button[data-art="gast"]');
  const neu = seite.locator('#hm-mp-charakter .hm-knopf', { hasText: /Charakter erstellen|Neuen Charakter erstellen/ }).first();
  await neu.click();
  if (await seite.locator('#hm-frage[open]').count()) await seite.click('#hm-frage-ja');
  await seite.fill('#ce-name', name);
  await seite.click('#ce-laden');
}
