// Trabajo del observador fuera del hilo de la página (lo corre trabajador.js): verifica, sigue en vivo y
// avisa lo que hay que dibujar. Sin DOM ni globales del navegador, para probarlo en node (observar_test.mjs).
import { LATIDO_MS, Observador, foto } from './nucleo.js';

const pausa = (ms) => new Promise((r) => setTimeout(() => r(true), ms));

/**
 * trabajo devuelve `seguir()`, que sincroniza y sigue la cadena, y `ver(eleccion)`, que cambia de votación (null:
 * todas) sin volver a verificar. Avisa `avance`, `vista`, `corte` (sin conexión, se reintenta) o `falla` (no se pudo
 * verificar). `visible` dice si la pestaña se ve: oculta no consulta al nodo. `dormir` en falso termina.
 */
export function trabajo({ datos, avisar, cargarVotocore, fetch, visible, dormir = pausa }) {
  let { eleccion } = datos;
  let listo = null;
  const mostrar = (o) => avisar({ tipo: 'vista', foto: foto(o) });

  async function verificar() {
    const o = new Observador({ ...datos, votocore: await cargarVotocore(), fetch });
    await o.iniciar((avance) => avisar({ tipo: 'avance', ...avance }));
    return o;
  }

  async function latir() {
    try {
      await listo.latido();
      mostrar(listo);
    } catch (e) {
      avisar({ tipo: 'corte', texto: e.message });
    }
  }

  return {
    async seguir() {
      try {
        listo = await verificar();
        listo.mirar(eleccion);
        mostrar(listo);
      } catch (e) {
        avisar({ tipo: 'falla', texto: `No se pudo verificar la cadena: ${e.message}` });
        return;
      }
      while (await dormir(LATIDO_MS)) {
        if (visible()) await latir();
      }
    },
    ver(pedida) {
      eleccion = pedida;
      if (!listo) return;
      listo.mirar(pedida);
      mostrar(listo);
    },
  };
}
