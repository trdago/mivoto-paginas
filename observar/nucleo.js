// Núcleo del observador web de Mi Voto: sin DOM, para probarlo en node (observar_test.mjs).
// Cada bloque se verifica con votocore (WebAssembly) y los validadores fijados en la página;
// del nodo solo se leen bytes con GET. Ver .qdd/project/modules/observador-web.yaml.

export const LATIDO_MS = 2000;
const PAGINA = 100; // bloques por pedido al sincronizar
const MAX_FEED = 30;
const LOTE = 128 * 1024; // bytes por verificación: los bloques pesados avisan su avance

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

/** participacion son las cifras que se ven en vivo, también en una votación secreta abierta. */
export function participacion(vista) {
  if (vista.mode === 'secreto') {
    return [
      { etiqueta: 'Credenciales emitidas', valor: vista.voters },
      { etiqueta: 'Votos anónimos', valor: vista.ballots },
    ];
  }
  return [
    { etiqueta: 'Participantes', valor: vista.voters },
    { etiqueta: 'Toques', valor: vista.ballots },
  ];
}

/** filasResultado es el resultado por opción; vacío mientras la votación secreta sigue abierta. */
export function filasResultado(vista) {
  if (vista.hidden || !vista.tally) return [];
  const total = vista.tally.reduce((a, b) => a + b, 0);
  return vista.options.map((opcion, i) => {
    const votos = vista.tally[i] ?? 0;
    return { opcion, votos, pct: total ? Math.round((votos * 1000) / total) / 10 : 0, gana: vista.winner === i };
  });
}

/** porBloque parte una respuesta de /v1/blocks en cuerpos de un bloque, como los pide votocore.inspect. */
export function porBloque(bytes) {
  const { blocks = [] } = JSON.parse(new TextDecoder().decode(bytes));
  return blocks.map((b) => new TextEncoder().encode(JSON.stringify({ blocks: [b] })));
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

/** unir arma un solo cuerpo, como una página de /v1/blocks, con bloques separados por porBloque. */
function unir(bloques) {
  const texto = bloques.map((b) => JSON.parse(new TextDecoder().decode(b)).blocks[0]);
  return new TextEncoder().encode(JSON.stringify({ blocks: texto }));
}

/** foto es lo que la página dibuja: datos sueltos, que pasan del Web Worker a la página. */
export function foto(o) {
  const { altura, vista, feed, nodoEstado, nodoDistinto, validadores } = o;
  return { altura, vista, feed, nodoEstado, nodoDistinto, validadores };
}

/** filaDeBloque resume un bloque verificado para la lista en vivo. */
export function filaDeBloque(b) {
  const propias = b.txs.filter((t) => t.mine);
  return {
    altura: b.height,
    hash: b.hash,
    hora: b.time,
    txs: b.tx_count,
    firmas: b.signers.length,
    propias: propias.length,
    detalle: resumen(propias),
  };
}

function resumen(txs) {
  const cuenta = new Map();
  for (const t of txs) cuenta.set(etiqueta(t.kind), (cuenta.get(etiqueta(t.kind)) ?? 0) + 1);
  return [...cuenta].map(([e, n]) => (n > 1 ? `${n} × ${e}` : e)).join(' · ');
}

/**
 * Observador sigue una votación: sincroniza la cadena desde el bloque 1 verificando cada uno,
 * y luego, en cada latido, baja solo los bloques nuevos. Solo hace GET al nodo.
 */
export class Observador {
  constructor({ nodo, validadores, eleccion, votocore, fetch, alCambiar = () => {} }) {
    Object.assign(this, { nodo, validadores, eleccion, votocore, fetch, alCambiar });
    this.altura = 0;
    this.vista = null;
    this.feed = [];
    this.nodoEstado = null;
    this.error = null;
  }

  async iniciar(progreso = () => {}) {
    falla(this.votocore.open(this.validadores.join(',')));
    await this.leerEstado();
    await this.sincronizar(progreso, false);
    this.actualizarVista();
    await this.cargarRastro();
    this.alCambiar(this);
  }

  async latido() {
    await this.leerEstado();
    if (this.nodoEstado.height <= this.altura) return;
    await this.sincronizar(() => {}, true);
    this.actualizarVista();
    this.alCambiar(this);
  }

  async leerEstado() {
    this.nodoEstado = await (await this.leer('/v1/status')).json();
    this.nodoDistinto = this.nodoEstado.validators.join(',') !== this.validadores.join(',');
  }

  async sincronizar(progreso, enVivo) {
    for (;;) {
      const bytes = new Uint8Array(await (await this.leer(`/v1/blocks?from=${this.altura + 1}&limit=${PAGINA}`)).arrayBuffer());
      const bloques = porBloque(bytes);
      if (bloques.length === 0) return;
      for (const lote of lotes(bloques)) {
        this.altura = falla(this.votocore.apply(unir(lote))).height;
        progreso(this.altura, this.nodoEstado.height);
      }
      if (enVivo) bloques.forEach((b) => this.alFeed(b));
    }
  }

  actualizarVista() {
    const r = this.votocore.live(this.eleccion);
    this.vista = r.error ? null : JSON.parse(r.json);
  }

  async cargarRastro() {
    for (const h of this.vista?.trail ?? []) {
      const bytes = new Uint8Array(await (await this.leer(`/v1/blocks?from=${h}&limit=1`)).arrayBuffer());
      porBloque(bytes).forEach((b) => this.alFeed(b));
    }
  }

  alFeed(cuerpo) {
    const r = falla(this.votocore.inspect(cuerpo, this.eleccion, Boolean(this.vista?.closed)));
    this.feed.unshift(filaDeBloque(JSON.parse(r.json)));
    this.feed.length = Math.min(this.feed.length, MAX_FEED);
  }

  async leer(ruta) {
    const r = await this.fetch(this.nodo + ruta, { method: 'GET', cache: 'no-store' });
    if (!r.ok) throw new Error(`el nodo respondió ${r.status} a ${ruta.split('?')[0]}`);
    return r;
  }
}

function falla(r) {
  if (r.error) throw new Error(r.error);
  return r;
}
