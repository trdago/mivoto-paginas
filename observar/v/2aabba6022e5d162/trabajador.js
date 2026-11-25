// Web Worker del observador: votocore (WebAssembly) verifica aquí, para que la página no se congele (FND-010).
import './wasm_exec.js';

import { trabajo } from './trabajo.js';

let visible = true;
let encargo = null;

async function cargarVotocore() {
  const go = new Go();
  const r = await fetch(new URL('votocore.wasm', import.meta.url));
  if (!r.ok) throw new Error(`el verificador respondió ${r.status}`);
  const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), go.importObject);
  go.run(instance);
  return globalThis.votocore;
}

const PEDIDOS = {
  seguir({ datos }) {
    encargo = trabajo({
      datos,
      avisar: (m) => self.postMessage(m),
      cargarVotocore,
      fetch: (...a) => fetch(...a),
      visible: () => visible,
    });
    encargo.seguir();
  },
  ver({ eleccion, acta, sueltas }) {
    encargo.ver(eleccion, acta, sueltas);
  },
  listar({ texto, cuantas }) {
    encargo.listar(texto, cuantas);
  },
  comprobar({ checksum }) {
    encargo.comprobar(checksum);
  },
  todo() {
    encargo.verificarTodo();
  },
  detener() {
    encargo.detener();
  },
  visible() {},
};

self.onmessage = ({ data }) => {
  visible = data.visible;
  PEDIDOS[data.tipo](data);
};
