// Núcleo del observador web de Mi Voto: sin DOM, para probarlo en node (observar_test.mjs).
// votocore (WebAssembly) verifica con los validadores fijados en la página; del nodo solo se leen bytes con GET.
// Al abrir encadena y recuenta hasta un bloque firmado por todos; las firmas de cada voto se revisan a demanda. Ver .qdd/project/modules/observador-web.yaml.

export const LATIDO_MS = 2000;
const PAGINA = 250; // bloques por pedido
const A_LA_VEZ = 8; // pedidos simultáneos al sincronizar
const LOTE = 128 * 1024; // bytes por verificación: los bloques pesados avisan su avance
const CUPO = 32 * 1024 * 1024; // bytes de bloques en memoria, para revisar sus firmas sin bajarlos de nuevo

const ETIQUETAS = {
  DEVICE_REGISTER: 'Registro de teléfono',
  ELECTION_CREATE: 'Nueva votación',
  ENROLL_REQUEST: 'Pide entrar al padrón',
  ENROLL_DECISION: 'Decisión de padrón',
  URFA_VOTE: 'Toque URFA',
  ELECTION_KEY: 'Clave de emisión',
  CREDENTIAL_REQUEST: 'Credencial (participó)',
  BALLOT: 'Voto anónimo',
};

export const etiqueta = (kind) => ETIQUETAS[kind] ?? kind;

/** eleccionDe saca el id de la votación del fragmento del enlace (#<64 hex>). */
export function eleccionDe(fragmento) {
  const id = (fragmento ?? '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(id) ? id : null;
}

/** estadoDe dice si la votación aún no empieza, está abierta o cerró, con la hora del navegador. */
export function estadoDe(vista, ahora) {
  if (vista.closed) return { abierta: false, texto: 'Cerrada' };
  if (ahora < vista.starts_at) return { abierta: false, texto: `Empieza en ${duracion(vista.starts_at - ahora)}` };
  if (ahora >= vista.ends_at) return { abierta: true, texto: 'Cerrando…' };
  return { abierta: true, texto: `Abierta · cierra en ${duracion(vista.ends_at - ahora)}` };
}

export function duracion(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const dos = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h} h ${dos(m)} min`;
  return `${m}:${dos(s % 60)}`;
}

const CIFRAS = {
  secreto: [['Credencial emitida', 'Credenciales emitidas'], ['Voto anónimo', 'Votos anónimos']],
  urfa: [['Participante', 'Participantes'], ['Toque', 'Toques']],
};

/** participacion son las cifras que se ven en vivo, también en una votación secreta abierta. */
export function participacion(vista) {
  const [personas, votos] = CIFRAS[vista.mode] ?? CIFRAS.urfa;
  return [cifra(personas, vista.voters), cifra(votos, vista.ballots)];
}

const cifra = ([uno, varios], valor) => ({ etiqueta: valor === 1 ? uno : varios, valor });

/** filasResultado es el resultado por opción; vacío mientras la votación secreta sigue abierta. */
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

/** revisadas dice en palabras cuántas transacciones de la votación tienen su firma revisada. */
export function revisadas(vista) {
  const n = (x) => x.toLocaleString('es-CL');
  if (vista.txs_checked >= vista.txs) {
    return { completa: true, texto: `Las ${n(vista.txs)} transacciones de esta votación tienen su firma revisada en tu navegador.` };
  }
  return { completa: false, texto: `Revisando las firmas de esta votación: ${n(vista.txs_checked)} de ${n(vista.txs)} transacciones.` };
}

/** foto es lo que la página dibuja: datos sueltos, que pasan del Web Worker a la página. */
export function foto(o) {
  const { altura, eleccion, elecciones, vista, feed, nodoEstado, nodoDistinto, validadores } = o;
  return { altura, eleccion, elecciones, vista, feed, nodoEstado, nodoDistinto, validadores };
}

/** listado separa las votaciones para la portada: primero lo que cierra o empieza antes, o lo que cerró último. */
export function listado(elecciones, ahora) {
  const por = (campo, sentido) => (a, b) => sentido * (a[campo] - b[campo]);
  const vigentes = elecciones.filter((v) => !v.closed);
  return {
    enCurso: vigentes.filter((v) => ahora >= v.starts_at).sort(por('ends_at', 1)),
    porEmpezar: vigentes.filter((v) => ahora < v.starts_at).sort(por('starts_at', 1)),
    cerradas: elecciones.filter((v) => v.closed).sort(por('ends_at', -1)),
  };
}

/** cierre dice en una línea cómo terminó una votación; vacío si no ha cerrado. */
export function cierre(vista) {
  if (!vista.closed) return '';
  if (vista.winner >= 0) return `Ganó «${vista.options[vista.winner]}»`;
  return vista.ballots > 0 ? 'Empate' : 'Sin votos';
}

/**
 * filaDeBloque resume un bloque verificado para la lista: en la portada nombra la votación de cada cosa; al mirar
 * una, muestra solo lo suyo. `txs` es null si votocore no dice cuántas trae (hay una votación secreta abierta).
 */
export function filaDeBloque(b, eleccion) {
  const eventos = b.events.filter((e) => !eleccion || e.election === eleccion);
  return {
    altura: b.height,
    hash: b.hash,
    hora: b.time,
    txs: b.txs < 0 ? null : b.txs,
    firmas: b.signers,
    propias: b.mine,
    detalle: eventos.map((e) => evento(e, eleccion)).join(' · '),
  };
}

function evento(e, eleccion) {
  const veces = e.n > 1 ? `${e.n} × ` : '';
  const titulo = e.title && !eleccion ? ` «${e.title}»` : '';
  return veces + etiqueta(e.kind) + titulo;
}

/** ErrorDeVerificacion es lo que no se arregla reintentando: la cadena entregada no verifica. */
export class ErrorDeVerificacion extends Error {}

/**
 * Observador sigue la cadena: la encadena y recuenta desde el bloque 1 hasta uno firmado por los validadores y luego,
 * en cada latido, baja solo los bloques nuevos. Mira una votación o todas (eleccion null). Solo hace GET al nodo.
 */
export class Observador {
  constructor({ nodo, validadores, eleccion = null, votocore, fetch, cupo = CUPO }) {
    Object.assign(this, { nodo, validadores, eleccion, votocore, fetch, cupo });
    this.memoria = new Map(); // altura → bloque por revisar; solo en memoria, nada queda en el aparato
    this.altura = 0;
    this.elecciones = [];
    this.feed = [];
    this.nodoEstado = null;
  }

  /** vista es la votación que se mira; null en la portada o si no está en la cadena. */
  get vista() {
    return this.elecciones.find((v) => v.id === this.eleccion) ?? null;
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

  /** mirar cambia de votación (null: todas) con lo ya encadenado. */
  mirar(eleccion) {
    this.eleccion = eleccion;
    this.actualizar();
  }

  actualizar() {
    this.elecciones = JSON.parse(falla(this.votocore.elections()).json);
    this.feed = JSON.parse(falla(this.votocore.feed(this.eleccion ?? '')).json).map((b) => filaDeBloque(b, this.eleccion));
  }

  async leerEstado() {
    this.nodoEstado = await (await this.leer('/v1/status')).json();
    this.nodoDistinto = this.nodoEstado.validators.join(',') !== this.validadores.join(',');
  }

  async sincronizar(progreso) {
    const { height } = this.nodoEstado;
    const faltan = Array.from({ length: height - this.altura }, (_, i) => this.altura + 1 + i);
    for await (const pagina of enOrden(rangos(faltan), (r) => this.bajar(r))) {
      const desde = this.altura + 1;
      this.altura = falla(this.votocore.link(pagina)).height || this.altura;
      this.recordar(desde, pagina);
      progreso({ altura: this.altura, alto: height });
    }
    if (this.altura < height) throw new Error(`el nodo anuncia ${height} bloques y entrega ${this.altura}`);
    falla(this.votocore.seal());
  }

  /** faltan son las alturas cuyas firmas no se han revisado: de una votación, o de toda la cadena con null. */
  faltan(eleccion) {
    return JSON.parse(falla(this.votocore.unchecked(eleccion ?? '')).json);
  }

  /**
   * revisar baja y revisa las firmas que faltan de una votación, o de toda la cadena con null. `alAvanzar` corre tras
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
