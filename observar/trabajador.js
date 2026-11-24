// Web Worker del observador: votocore (WebAssembly) verifica aquí, para que la página no se congele (FND-010).
import './wasm_exec.js';

import { trabajar } from './trabajo.js';

let visible = true;

async function cargarVotocore() {
  const go = new Go();
  const r = await fetch(new URL('votocore.wasm', import.meta.url));
  if (!r.ok) throw new Error(`el verificador respondió ${r.status}`);
  const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), go.importObject);
  go.run(instance);
  return globalThis.votocore;
}

self.onmessage = ({ data }) => {
  visible = data.visible;
  if (data.tipo !== 'seguir') return;
  trabajar({
    datos: data.datos,
    avisar: (m) => self.postMessage(m),
    cargarVotocore,
    fetch: (...a) => fetch(...a),
    visible: () => visible,
  });
};
