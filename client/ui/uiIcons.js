/**
 * UI-Icons (game-icons.net, CC BY 3.0): Sprite client/assets/eigene/ui-icons.svg (gebaut von werkzeuge/assets/baue_ui_icons.mjs)
 * wird einmal ins Dokument eingehängt → überall `<svg class="ui-icon"><use href="#i-<id>"/></svg>` bzw. uiIcon(id).
 * Farbe = currentColor (per CSS je Wert/Knopf).
 */
let geladen = null;

/** Sprite laden & unsichtbar in den Body hängen (einmalig; Fehler = Icons fehlen still, Text-Titel bleiben). */
export function ladeUiIcons(dokument = document) {
  geladen ??= fetch(new URL('../assets/eigene/ui-icons.svg', import.meta.url))
    .then((r) => (r.ok ? r.text() : ''))
    .then((text) => {
      if (!text) return;
      const huelle = dokument.createElement('div');
      huelle.hidden = true;
      huelle.innerHTML = text;
      dokument.body.prepend(huelle);
    })
    .catch(() => {});
  return geladen;
}

/** HTML eines Icons (für innerHTML). */
export function uiIcon(id, klasse = '') {
  return `<svg class="ui-icon${klasse ? ` ${klasse}` : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}
