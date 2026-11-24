// Trabajo del observador fuera del hilo de la página (lo corre trabajador.js): verifica, sigue en vivo y
// avisa lo que hay que dibujar. Sin DOM ni globales del navegador, para probarlo en node (observar_test.mjs).
import { LATIDO_MS, Observador, foto } from './nucleo.js';

const pausa = (ms) => new Promise((r) => setTimeout(() => r(true), ms));

/**
 * trabajar sincroniza y sigue la votación. Avisa `avance`, `vista`, `corte` (sin conexión, se reintenta) o `falla`
 * (no se pudo verificar). `visible` dice si la pestaña se ve: oculta no consulta al nodo. `dormir` en falso termina.
 */
export async function trabajar({ datos, avisar, cargarVotocore, fetch, visible, dormir = pausa }) {
  const o = await verificar({ datos, avisar, cargarVotocore, fetch });
  if (!o) return;
  while (await dormir(LATIDO_MS)) {
    if (visible()) await latir(o, avisar);
  }
}

async function verificar({ datos, avisar, cargarVotocore, fetch }) {
  try {
    const o = new Observador({ ...datos, votocore: await cargarVotocore(), fetch });
    await o.iniciar((altura, alto) => avisar({ tipo: 'avance', altura, alto }));
    avisar({ tipo: 'vista', foto: foto(o) });
    return o;
  } catch (e) {
    avisar({ tipo: 'falla', texto: `No se pudo verificar la cadena: ${e.message}` });
    return null;
  }
}

async function latir(o, avisar) {
  try {
    await o.latido();
    avisar({ tipo: 'vista', foto: foto(o) });
  } catch (e) {
    avisar({ tipo: 'corte', texto: e.message });
  }
}
