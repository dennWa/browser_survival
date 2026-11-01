/**
 * Vorab-Skript (Preload) des Studio-Fensters: einzige Brücke zum Hauptprozess.
 *   window.studioNativ.aufruf(aktion, daten) → Promise   (studio/main/start.mjs AKTIONEN)
 *   window.studioNativ.bei(kanal, f)                      Ereignisse: 'ki-ereignis', 'mcp-aktivitaet'
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioNativ', {
  aufruf: (aktion, daten) => ipcRenderer.invoke('studio', aktion, daten),
  bei: (kanal, f) => {
    if (!['ki-ereignis', 'mcp-aktivitaet'].includes(kanal)) return;
    ipcRenderer.on(kanal, (_e, d) => f(d));
  },
});
