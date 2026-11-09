/**
 * Runde 47: Takt aus einem Web Worker für den Browser-Host. Im Hintergrund-Tab drosseln Browser setTimeout im Haupt-Thread
 * auf ~1/s – der SpielServer (Taktgeber) käme dann nur noch auf 5 Ticks/s, Freunde sähen Standbild. Timer in einem
 * dedizierten Worker laufen weiter; der Worker meldet nur „Zeit ist um“, gerechnet wird weiter im Haupt-Thread.
 * @returns { setTimeout(fn, ms), clearTimeout(id) } oder null (kein Worker verfügbar → normaler Timer)
 */
export function workerPlaner() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') return null;
  let worker;
  try {
    const code = 'const t=new Map();onmessage=(e)=>{const[id,ms]=e.data;if(ms<0){clearTimeout(t.get(id));t.delete(id);return}t.set(id,setTimeout(()=>{t.delete(id);postMessage(id)},ms))}';
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  } catch {
    return null;
  }
  const wartend = new Map();
  let naechste = 1;
  worker.onmessage = (e) => {
    const fn = wartend.get(e.data);
    wartend.delete(e.data);
    fn?.();
  };
  return {
    setTimeout(fn, ms) {
      const id = naechste++;
      wartend.set(id, fn);
      worker.postMessage([id, Math.max(0, ms)]);
      return id;
    },
    clearTimeout(id) {
      if (!wartend.delete(id)) return;
      worker.postMessage([id, -1]);
    },
  };
}
