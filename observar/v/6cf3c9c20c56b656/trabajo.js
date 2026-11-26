// Trabajo del observador fuera del hilo de la página (lo corre trabajador.js): verifica, sigue en vivo y
// avisa lo que hay que dibujar. Sin DOM ni globales del navegador, para probarlo en node (observar_test.mjs).
import { ErrorDeVerificacion, LATIDO_MS, Observador, foto } from './nucleo.js';

const pausa = (ms) => new Promise((r) => setTimeout(() => r(true), ms));

/**
 * trabajo devuelve `seguir()`, que abre y sigue la cadena; `ver(enlace)`, que cambia a lo que pide otro enlace (vacío: la
 * portada) y revisa sus firmas; `listar(texto, cuantas)`, que busca mesas; `masSets()`, que muestra más sets;
 * `comprobar(checksum)`, que busca un archivo por su huella; `comprobarSet(archivo)`, que lo compara con el set que se mira;
 * `verificarTodo()`, que revisa las firmas de toda la cadena; `detener()`, que la detiene; y `revisado()`, que espera a que
 * no quede nada por revisar. Avisa `avance`, `vista`, `corte` (sin conexión, se reintenta) o `falla` (no verifica).
 * `visible` dice si la pestaña se ve: oculta no consulta al nodo ni revisa. `dormir` en falso termina.
 */
export function trabajo({ datos, avisar, cargarVotocore, fetch, visible, dormir = pausa, respirar = () => pausa(0) }) {
  const { nodo, validadores, ...pedido } = datos;
  let enlace = pedido;
  let listo = null;
  let roto = false;
  let revision = null;
  const todo = { pedida: false, faltan: null };

  function mostrar() {
    if (!roto) avisar({ tipo: 'vista', foto: { ...foto(listo), todo: { ...todo } } });
  }

  /** tropezar: lo que no verifica detiene la página; un corte de red se reintenta en el próximo latido. */
  function tropezar(e) {
    if (!(e instanceof ErrorDeVerificacion)) return avisar({ tipo: 'corte', texto: e.message });
    roto = true;
    return romper(e);
  }

  function romper(e) {
    avisar({ tipo: 'falla', texto: `No se pudo verificar la cadena: ${e.message}` });
  }

  async function abrir(votocore) {
    const o = new Observador({ ...datos, votocore, fetch });
    await o.iniciar((avance) => avisar({ tipo: 'avance', ...avance }));
    o.mirar(enlace);
    return o;
  }

  /** primeraVez abre la cadena: un corte de red se avisa y se reintenta; lo que no verifica la detiene. */
  async function primeraVez(votocore) {
    for (let intentar = true; intentar; intentar = await dormir(LATIDO_MS)) {
      const o = await abrir(votocore).catch((e) => e);
      if (!(o instanceof Error)) return o;
      if (o instanceof ErrorDeVerificacion) return romper(o);
      avisar({ tipo: 'corte', texto: o.message });
    }
    return undefined;
  }

  async function latir() {
    try {
      await listo.latido();
      mostrar();
      revisar();
    } catch (e) {
      tropezar(e);
    }
  }

  /** objetivo es lo que toca revisar: la elección o el acta que se mira, toda la cadena (null) si se pidió, o nada. */
  function objetivo() {
    if (!visible()) return undefined;
    if (listo.sujeto && listo.faltan(listo.sujeto).length > 0) return listo.sujeto;
    if (todo.pedida && todo.faltan > 0) return null;
    return undefined;
  }

  /** revisar pone a revisar firmas si no se está en eso. */
  function revisar() {
    contarFaltantes();
    revision ??= revisarObjetivos().catch(tropezar).finally(() => { revision = null; });
  }

  async function revisarObjetivos() {
    for (let actual = objetivo(); actual !== undefined; actual = objetivo()) {
      const sigue = () => objetivo() === actual;
      await listo.revisar(actual, { alAvanzar: refrescar, sigue });
    }
  }

  /** contarFaltantes pone al día lo que falta de toda la cadena, si alguna vez se pidió. */
  function contarFaltantes() {
    if (todo.pedida || todo.faltan !== null) todo.faltan = listo.faltan(null).length;
  }

  async function refrescar() {
    contarFaltantes();
    listo.actualizar();
    mostrar();
    await respirar();
  }

  return {
    async seguir() {
      const votocore = await cargarVotocore().catch((e) => romper(e));
      listo = votocore && await primeraVez(votocore);
      if (!listo) return undefined;
      mostrar();
      revisar();
      while (!roto && await dormir(LATIDO_MS)) {
        if (visible()) await latir();
      }
      return undefined;
    },
    ver(otro) {
      enlace = otro;
      if (!listo || roto) return;
      listo.mirar(otro);
      mostrar();
      revisar();
    },
    listar(texto, cuantas) {
      if (!listo || roto) return;
      listo.listar(texto, cuantas);
      mostrar();
    },
    comprobar(checksum) {
      if (!listo || roto) return;
      listo.comprobar(checksum);
      mostrar();
    },
    masSets() {
      if (!listo || roto) return;
      listo.masSets();
      mostrar();
    },
    /** comprobarSet avisa al empezar y al terminar; el archivo se lee aquí y no sale del aparato. */
    async comprobarSet(archivo) {
      if (!listo || roto) return;
      const lectura = listo.comprobarSet(archivo);
      mostrar();
      await lectura;
      mostrar();
    },
    verificarTodo() {
      if (!listo || roto) return;
      todo.pedida = true;
      revisar();
      mostrar();
    },
    /** detener deja de revisar toda la cadena; lo ya revisado queda, y al pedirlo de nuevo sigue desde ahí. */
    detener() {
      if (!todo.pedida) return;
      todo.pedida = false;
      contarFaltantes();
      mostrar();
    },
    async revisado() {
      while (revision) await revision;
    },
  };
}
