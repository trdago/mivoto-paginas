// Núcleo del observador web de Mi Voto: sin DOM, para probarlo en node (observar_test.mjs).
// votocore (WebAssembly) verifica con los validadores fijados en la página; del nodo solo se leen bytes con GET.
// Al abrir encadena y recuenta hasta un bloque firmado por todos; las firmas de cada voto se revisan a demanda. Ver .qdd/project/modules/observador-web.yaml.

import { tapar, taparEvento } from './ocultos.js';

export const LATIDO_MS = 2000;
const PAGINA = 250; // bloques por pedido
const A_LA_VEZ = 8; // pedidos simultáneos al sincronizar
const LOTE = 128 * 1024; // bytes por verificación: los bloques pesados avisan su avance
const ARCHIVO_MAX = 64 * 1024 * 1024; // bytes del archivo a comprobar: se lee entero, aquí
const SETS = 20; // sets de datos a la vista, y cuántos más cada vez
const LISTA = { de: null, texto: '', cuantas: 20 }; // mesas a la vista, y de qué elección
const CUPO = 32 * 1024 * 1024; // bytes de bloques en memoria, para revisar sus firmas sin bajarlos de nuevo

const ETIQUETAS = {
  DEVICE_REGISTER: 'Registro de teléfono',
  ELECTION_CREATE: 'Nueva elección',
  ENROLL_REQUEST: 'Pide entrar al padrón',
  ENROLL_DECISION: 'Decisión de padrón',
  URFA_VOTE: 'Toque URFA',
  ELECTION_KEY: 'Clave de emisión',
  CREDENTIAL_REQUEST: 'Credencial (participó)',
  BALLOT: 'Voto anónimo',
  ACTA: 'Acta registrada',
  SET: 'Set de datos registrado',
};

export const etiqueta = (kind) => ETIQUETAS[kind] ?? kind;

/** eleccionDe saca el id de la elección del fragmento del enlace (#<64 hex>). */
export function eleccionDe(fragmento) {
  const id = (fragmento ?? '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(id) ? id : null;
}

/** actaDe saca del enlace el token o la mesa de un acta (#acta/<64 hex>). */
export function actaDe(fragmento) {
  const [, id] = (fragmento ?? '').trim().toLowerCase().match(/^#acta\/([0-9a-f]{64})$/) ?? [];
  return id ?? null;
}

/** sueltasDe dice si el enlace pide las actas sin elección (#actas). */
export const sueltasDe = (fragmento) => (fragmento ?? '').trim().toLowerCase() === '#actas';

/** setDe saca del enlace el token de un set de datos (#set/<64 hex>). */
export function setDe(fragmento) {
  const [, id] = (fragmento ?? '').trim().toLowerCase().match(/^#set\/([0-9a-f]{64})$/) ?? [];
  return id ?? null;
}

/** setsDe dice si el enlace pide los sets de datos (#sets). */
export const setsDe = (fragmento) => (fragmento ?? '').trim().toLowerCase() === '#sets';

/** enlaceDe es todo lo que puede pedir un enlace: a lo más una cosa; nada, en la portada. */
export const enlaceDe = (fragmento) => ({
  eleccion: eleccionDe(fragmento),
  acta: actaDe(fragmento),
  sueltas: sueltasDe(fragmento),
  set: setDe(fragmento),
  sets: setsDe(fragmento),
});

/** bytesDe lee un archivo elegido, en el aparato: su contenido no sale de aquí. */
async function bytesDe(archivo) {
  if (archivo.size === 0) throw new Error('El archivo está vacío.');
  if (archivo.size > ARCHIVO_MAX) throw new Error('El archivo pesa más de 64 MB.');
  return new Uint8Array(await archivo.arrayBuffer());
}

/** huella es el SHA-256 (hex) de un archivo, calculado en el aparato: el contenido no sale de aquí. */
export async function huella(archivo) {
  const suma = new Uint8Array(await crypto.subtle.digest('SHA-256', await bytesDe(archivo)));
  return [...suma].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** filasResultado es el resultado por opción; vacío mientras la elección secreta sigue abierta, o si es de actas. */
export function filasResultado(vista) {
  if (vista.hidden || !vista.tally) return [];
  const total = vista.tally.reduce((a, b) => a + b, 0);
  return vista.options.map((opcion, i) => {
    const votos = vista.tally[i] ?? 0;
    return { opcion, votos, pct: total ? Math.round((votos * 1000) / total) / 10 : 0, gana: vista.winner === i };
  });
}

/** bloquesDe saca los bloques (texto base64) de una respuesta de /v1/blocks. */
export function bloquesDe(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes)).blocks ?? [];
}

/** lotes agrupa bloques hasta `max` bytes por grupo; uno más grande va solo. */
export function lotes(bloques, max = LOTE) {
  const grupos = [];
  let bytes = Infinity;
  for (const b of bloques) {
    bytes += b.length;
    if (bytes > max) {
      grupos.push([]);
      bytes = b.length;
    }
    grupos.at(-1).push(b);
  }
  return grupos;
}

/** rangos junta alturas seguidas en tramos [desde, hasta] de a lo más `max` bloques. */
export function rangos(alturas, max = PAGINA) {
  const tramos = [];
  for (const h of alturas) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo[1] === h - 1 && h - ultimo[0] < max) {
      ultimo[1] = h;
      continue;
    }
    tramos.push([h, h]);
  }
  return tramos;
}

/** enOrden baja hasta `aLaVez` cosas a la vez y las entrega en el orden pedido. */
export async function* enOrden(pedidos, bajar, aLaVez = A_LA_VEZ) {
  const enVuelo = [];
  for (const p of pedidos) {
    const bajada = bajar(p);
    bajada.catch(() => {}); // si falla, lo dice quien la espera
    enVuelo.push(bajada);
    if (enVuelo.length >= aLaVez) yield enVuelo.shift();
  }
  yield* enVuelo;
}

/** unir arma un solo cuerpo, como una página de /v1/blocks, con bloques separados por bloquesDe. */
function unir(bloques) {
  return new TextEncoder().encode(JSON.stringify({ blocks: bloques }));
}

/** foto es lo que la página dibuja: datos sueltos, que pasan del Web Worker a la página. */
export function foto(o) {
  const { altura, enlace, elecciones, vista, mesa, sueltas, actas, lista, archivo, set, sets, setsSueltos, comprobacion, feed, nodoEstado, nodoDistinto, validadores } = o;
  return { altura, enlace, elecciones, vista, mesa, sueltas, actas, lista, archivo, set, sets, setsSueltos, comprobacion, feed, nodoEstado, nodoDistinto, validadores };
}

/** deTipo son las elecciones de un tipo; todas si no se elige ninguno. */
export const deTipo = (elecciones, tipo) => elecciones.filter((v) => !tipo || v.mode === tipo);

/** hayArchivos dice si la cadena tiene algún archivo que comprobar: un acta, dentro de una elección o suelta, o un set de datos. */
export const hayArchivos = ({ sueltas, setsSueltos, elecciones }) => sueltas.tokens > 0 || setsSueltos.chain > 0 || elecciones.some((v) => v.tokens > 0);

/** listado separa las elecciones para la portada: primero lo que cierra o empieza antes, o lo que cerró último. */
export function listado(elecciones, ahora) {
  const por = (campo, sentido) => (a, b) => sentido * (a[campo] - b[campo]);
  const vigentes = elecciones.filter((v) => !v.closed);
  return {
    enCurso: vigentes.filter((v) => ahora >= v.starts_at).sort(por('ends_at', 1)),
    porEmpezar: vigentes.filter((v) => ahora < v.starts_at).sort(por('starts_at', 1)),
    cerradas: elecciones.filter((v) => v.closed).sort(por('ends_at', -1)),
  };
}

/**
 * filaDeBloque resume un bloque verificado para la lista: en la portada nombra la elección de cada cosa; al mirar
 * una, muestra solo lo suyo. `txs` es null si votocore no dice cuántas trae (hay una elección secreta abierta).
 */
export function filaDeBloque(b, eleccion) {
  const eventos = b.events.filter((e) => !eleccion || [e.election, e.mesa, ...(e.sets ?? []).map((s) => s.tx)].includes(eleccion));
  return {
    altura: b.height,
    hash: b.hash,
    hora: b.time,
    txs: b.txs < 0 ? null : b.txs,
    firmas: b.signers,
    propias: b.mine,
    detalle: eventos.map((e) => evento(taparEvento(e), eleccion)).join(' · '),
  };
}

function evento(e, eleccion) {
  const propio = eleccion && e.sets?.some((s) => s.tx === eleccion);
  const veces = e.n > 1 && !propio ? `${e.n} × ` : '';
  return veces + etiqueta(e.kind) + (eleccion ? '' : nombres(e));
}

/** nombres dice la elección de un evento, o los primeros sets de datos. */
function nombres(e) {
  if (!e.sets) return e.title ? ` «${e.title}»` : '';
  const otros = e.n > e.sets.length ? ` y ${e.n - e.sets.length} más` : '';
  return ` ${e.sets.map((s) => `«${s.title}»`).join(', ')}${otros}`;
}

const tapados = (sets) => ({ ...sets, list: sets.list.map((s) => tapar(s)) });

/** ErrorDeVerificacion es lo que no se arregla reintentando: la cadena entregada no verifica. */
export class ErrorDeVerificacion extends Error {}

/**
 * Observador sigue la cadena: la encadena y recuenta desde el bloque 1 hasta uno firmado por los validadores y luego,
 * en cada latido, baja solo los bloques nuevos. Mira lo que pide el enlace: una elección, la mesa de un acta, un set de datos, una lista, o todo. Solo hace GET al nodo.
 */
export class Observador {
  constructor({ nodo, validadores, votocore, fetch, cupo = CUPO, ...enlace }) {
    Object.assign(this, { nodo, validadores, votocore, fetch, cupo, enlace });
    this.memoria = new Map(); // altura → bloque por revisar; solo en memoria, nada queda en el aparato
    this.altura = 0;
    this.sellada = true; // falso mientras entran bloques: lo encadenado aún no se puede mostrar (FND-015)
    this.elecciones = [];
    this.sueltas = { tokens: 0, mesas: 0, list: [] }; // actas de antes de que fueran dentro de una elección
    this.actas = null; // las mesas de lo que se mira, si es de actas
    this.lista = { ...LISTA };
    this.mesa = null;
    this.buscado = null; // huella del archivo por comprobar; solo en memoria
    this.archivo = null;
    this.set = null; // el set que se mira
    this.sets = null; // los de lo que se mira: una elección, o los sueltos
    this.setsSueltos = { total: 0, list: [] };
    this.cuantosSets = SETS;
    this.comprobacion = null; // qué salió del archivo elegido en un set; solo en memoria
    this.feed = [];
    this.nodoEstado = null;
  }

  /** vista es la elección que se mira; null en la portada o si no está en la cadena. */
  get vista() {
    return this.elecciones.find((v) => v.id === this.enlace.eleccion) ?? null;
  }

  /** sujeto es el id de lo que se mira: una elección, un acta o un set; null en la portada. */
  get sujeto() {
    return this.enlace.acta ?? this.enlace.set ?? this.enlace.eleccion ?? null;
  }

  async iniciar(progreso = () => {}) {
    falla(this.votocore.open(this.validadores.join(',')));
    await this.leerEstado();
    await this.sincronizar(progreso);
    this.actualizar();
  }

  async latido() {
    await this.leerEstado();
    if (this.nodoEstado.height <= this.altura) return;
    await this.sincronizar(() => {});
    this.actualizar();
  }

  /** mirar cambia a lo que pide otro enlace (vacío: la portada), con lo ya encadenado. */
  mirar(enlace) {
    this.enlace = enlace;
    this.cuantosSets = SETS;
    this.comprobacion = null;
    if (![null, this.lista.de].includes(this.deActas)) this.lista = { ...LISTA, de: this.deActas };
    this.actualizar();
  }

  /** listar busca mesas por su código y dice cuántas se ven. */
  listar(texto, cuantas) {
    this.lista = { ...this.lista, texto, cuantas };
    this.actualizar();
  }

  /** deActas es la elección cuyas mesas se listan: vacía, las sueltas; null, ninguna. */
  get deActas() {
    if (this.enlace.sueltas) return '';
    return this.vista?.mode === 'actas' ? this.enlace.eleccion : null;
  }

  /** deSets es la elección cuyos sets se listan: vacía, los sueltos; null, ninguna. */
  get deSets() {
    return this.enlace.sets ? '' : this.enlace.eleccion ?? null;
  }

  /** masSets deja a la vista más sets de la lista. */
  masSets() {
    this.cuantosSets += SETS;
    this.actualizar();
  }

  /** comprobarSet lee el archivo elegido, aquí, y mira si es el del set y si lo publicado sale de él. */
  async comprobarSet(archivo) {
    const tx = this.enlace.set;
    const propia = { tx, estado: 'leyendo' };
    this.comprobacion = propia;
    const salida = await this.comparar(tx, archivo);
    if (this.comprobacion === propia) this.comprobacion = { tx, ...salida };
  }

  async comparar(tx, archivo) {
    try {
      const bytes = await bytesDe(archivo);
      return { estado: 'listo', ...JSON.parse(falla(this.votocore.checkSet(tx, bytes)).json) };
    } catch (e) {
      return { estado: 'error', texto: e.message };
    }
  }

  /** comprobar busca un archivo por su huella, ahora y con cada bloque nuevo. */
  comprobar(checksum) {
    this.buscado = checksum;
    this.actualizar();
  }

  actualizar() {
    if (!this.sellada) return;
    const leerDe = (r) => JSON.parse(falla(r).json);
    this.elecciones = leerDe(this.votocore.elections());
    this.sueltas = leerDe(this.votocore.actas('', '', 0));
    this.actas = this.deActas === null ? null : leerDe(this.votocore.actas(this.deActas, this.lista.texto, this.lista.cuantas));
    this.mesa = this.enlace.acta ? leerDe(this.votocore.acta(this.enlace.acta)) : null;
    this.setsSueltos = leerDe(this.votocore.sets('', 0));
    this.sets = this.deSets === null ? null : tapados(leerDe(this.votocore.sets(this.deSets, this.cuantosSets)));
    const set = this.enlace.set ? leerDe(this.votocore.set(this.enlace.set)) : null;
    this.set = set && tapar(set);
    this.archivo = this.buscado && { checksum: this.buscado, tokens: leerDe(this.votocore.file(this.buscado)), sets: leerDe(this.votocore.setFile(this.buscado)).map((s) => tapar(s)) };
    const propio = this.mesa?.id ?? this.sujeto;
    this.feed = leerDe(this.votocore.feed(this.sujeto ?? '')).map((b) => filaDeBloque(b, propio));
  }

  async leerEstado() {
    this.nodoEstado = await (await this.leer('/v1/status')).json();
    this.nodoDistinto = this.nodoEstado.validators.join(',') !== this.validadores.join(',');
  }

  async sincronizar(progreso) {
    const { height } = this.nodoEstado;
    const faltan = Array.from({ length: height - this.altura }, (_, i) => this.altura + 1 + i);
    for await (const pagina of enOrden(rangos(faltan), (r) => this.bajar(r))) {
      this.sellada = false;
      const desde = this.altura + 1;
      this.altura = falla(this.votocore.link(pagina)).height || this.altura;
      this.recordar(desde, pagina);
      progreso({ altura: this.altura, alto: height });
    }
    if (this.altura < height) throw new Error(`el nodo anuncia ${height} bloques y entrega ${this.altura}`);
    falla(this.votocore.seal());
    this.sellada = true;
  }

  /** faltan son las alturas cuyas firmas no se han revisado: de una elección, o de toda la cadena con null. */
  faltan(eleccion) {
    return JSON.parse(falla(this.votocore.unchecked(eleccion ?? '')).json);
  }

  /**
   * revisar baja y revisa las firmas que faltan de una elección, o de toda la cadena con null. `alAvanzar` corre tras
   * cada lote; si `sigue` dice que no, se detiene ahí.
   */
  async revisar(eleccion, { alAvanzar = async () => {}, sigue = () => true } = {}) {
    const tramos = rangos(this.faltan(eleccion));
    for await (const { desde, bloques } of enOrden(tramos, (t) => this.tramo(t))) {
      let altura = desde;
      for (const lote of lotes(bloques)) {
        if (!sigue()) return;
        falla(this.votocore.check(unir(lote)));
        altura = this.soltar(altura, lote.length);
        await alAvanzar();
      }
    }
    const pendiente = this.faltan(eleccion)[0];
    if (pendiente && pendiente <= tramos.at(-1)[1]) throw new Error(`el nodo no entregó el bloque ${pendiente}`);
  }

  /** tramo entrega los bloques de un tramo: de la memoria si están todos, o bajados del nodo. */
  async tramo([desde, hasta]) {
    const bloques = [];
    for (let h = desde; this.memoria.has(h) && h <= hasta; h++) bloques.push(this.memoria.get(h));
    if (bloques.length === hasta - desde + 1) return { desde, bloques };
    return { desde, bloques: bloquesDe(await this.bajar([desde, hasta])) };
  }

  /** recordar deja en memoria los bloques recién bajados, mientras quepan. */
  recordar(desde, pagina) {
    bloquesDe(pagina).forEach((b, i) => {
      if (b.length > this.cupo) return;
      this.cupo -= b.length;
      this.memoria.set(desde + i, b);
    });
  }

  /** soltar saca de la memoria `n` bloques ya revisados y devuelve la altura que sigue. */
  soltar(desde, n) {
    for (let h = desde; h < desde + n; h++) {
      this.cupo += this.memoria.get(h)?.length ?? 0;
      this.memoria.delete(h);
    }
    return desde + n;
  }

  async bajar([desde, hasta]) {
    return new Uint8Array(await (await this.leer(`/v1/blocks?from=${desde}&limit=${hasta - desde + 1}`)).arrayBuffer());
  }

  async leer(ruta) {
    const r = await this.fetch(this.nodo + ruta, { method: 'GET', cache: 'no-store' });
    if (!r.ok) throw new Error(`el nodo respondió ${r.status} a ${ruta.split('?')[0]}`);
    return r;
  }
}

function falla(r) {
  if (r.error) throw new ErrorDeVerificacion(r.error);
  return r;
}
