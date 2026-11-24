// Interfaz del observador: dibuja lo que verifica el Web Worker (trabajador.js), la portada con todas las votaciones
// o una sola (#<votación>). Todo texto que viene de la cadena entra con textContent, nunca como HTML.
import { cierre, eleccionDe, estadoDe, filasResultado, listado, participacion, revisadas } from './nucleo.js';

const $ = (id) => document.getElementById(id);
const meta = (nombre) => document.querySelector(`meta[name="${nombre}"]`).content;
const corto = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const miles = (n) => n.toLocaleString('es-CL');
const hora = (ms) => new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fecha = (ms) => new Date(ms).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const MODOS = { secreto: 'Votación secreta', urfa: 'URFA' };
const GRUPOS = { 'en-curso': 'enCurso', 'por-empezar': 'porEmpezar', cerradas: 'cerradas' };

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function fallar(texto) {
  $('carga').hidden = true;
  $('falla').hidden = false;
  $('falla-texto').textContent = texto;
}

function dibujarCifras(vista) {
  $('cifras').replaceChildren(
    ...participacion(vista).map((p) => {
      const c = el('div', 'cifra');
      c.append(el('b', '', miles(p.valor)), el('span', 'suave', p.etiqueta));
      return c;
    }),
  );
}

function barrasDe(vista) {
  return filasResultado(vista).map((f) => {
    const o = el('div', f.gana ? 'opcion gana' : 'opcion');
    const fila = el('div', 'fila');
    fila.append(el('span', '', f.gana ? `${f.opcion} · gana` : f.opcion), el('span', 'suave', `${miles(f.votos)} · ${f.pct}%`));
    const barra = el('div', 'barra');
    const relleno = el('i');
    relleno.style.width = `${f.pct}%`;
    barra.append(relleno);
    o.append(fila, barra);
    return o;
  });
}

function dibujarFeed(o, nuevas) {
  $('feed').replaceChildren(
    ...o.feed.map((f) => {
      const li = el('li', ['bloque', f.propias ? 'propio' : '', nuevas.has(f.altura) ? 'nuevo' : ''].join(' ').trim());
      const fila = el('div', 'fila');
      fila.append(el('strong', '', `Bloque ${miles(f.altura)}`), el('span', 'mono suave', corto(f.hash)));
      const txs = f.txs === null ? '' : `${miles(f.txs)} tx · `;
      li.append(fila, el('div', 'suave', `${hora(f.hora)} · ${txs}firmado ${f.firmas}/2`));
      if (f.detalle) li.append(el('div', 'detalle', f.detalle));
      return li;
    }),
  );
}

/** tarjetaDe es una votación en la portada: lleva a ella y muestra cómo va, o cómo terminó. */
function tarjetaDe(v) {
  const a = el('a', 'votacion');
  a.href = `#${v.id}`;
  const fila = el('div', 'fila');
  fila.append(el('strong', '', v.title), el('span', 'etiqueta', MODOS[v.mode] ?? v.mode));
  const cifras = participacion(v).map((p) => `${miles(p.valor)} ${p.etiqueta.toLowerCase()}`).join(' · ');
  a.append(fila, estadoEnTarjeta(v), el('div', 'suave', [cierre(v), cifras].filter(Boolean).join(' · ')));
  if (!v.closed) a.append(...barrasDe(v));
  return a;
}

/** estadoEnTarjeta: de una cerrada, cuándo cerró; de las demás, lo que falta (dibujarEstados lo pone al día). */
function estadoEnTarjeta(v) {
  if (v.closed) return el('div', 'suave', `Cerró el ${fecha(v.ends_at)}`);
  const estado = el('div', 'suave');
  estado.dataset.estado = v.id;
  return estado;
}

const firmas = {};

/** dibujarGrupo rehace la lista solo si cambió, para no quitarle el foco a quien navega con el teclado. */
function dibujarGrupo(id, votaciones) {
  const firma = JSON.stringify(votaciones.map(({ height, ...v }) => v));
  $(id).hidden = votaciones.length === 0 && id !== 'en-curso';
  if (firmas[id] === firma) return;
  firmas[id] = firma;
  const foco = document.activeElement?.getAttribute('href');
  $(id).querySelector('.lista').replaceChildren(...votaciones.map(tarjetaDe));
  $(id).querySelector('.vacio')?.toggleAttribute('hidden', votaciones.length > 0);
  if (foco?.length > 1) $(id).querySelector(`a[href="${CSS.escape(foco)}"]`)?.focus();
}

function dibujarPortada(o) {
  document.title = 'Observador · Mi Voto';
  const grupos = listado(o.elecciones, Date.now());
  for (const [id, grupo] of Object.entries(GRUPOS)) dibujarGrupo(id, grupos[grupo]);
}

function dibujarVotacion(v) {
  document.title = `${v.title} · Observador · Mi Voto`;
  $('titulo').textContent = v.title;
  $('modo').textContent = MODOS[v.mode] ?? v.mode;
  dibujarCifras(v);
  $('resultado-oculto').hidden = !v.hidden;
  $('resultado').replaceChildren(...barrasDe(v));
}

/** dibujarEstados pone al día cuánto falta en cada votación a la vista; corre cada segundo. */
function dibujarEstados(o) {
  const ahora = Date.now();
  if (o.vista) $('estado').textContent = estadoDe(o.vista, ahora).texto;
  for (const v of o.elecciones) {
    const tarjeta = document.querySelector(`[data-estado="${v.id}"]`);
    if (tarjeta) tarjeta.textContent = estadoDe(v, ahora).texto;
  }
}

function problemaDe(o) {
  const revisadas = o.vista ? [o.vista] : o.elecciones;
  return revisadas.map((v) => v.invariants).find(Boolean);
}

/** tituloDe dice qué se revisó de lo que se ve: la votación con sus firmas, o la cadena. */
function tituloDe(o) {
  if (o.vista) return revisadas(o.vista).texto;
  if (o.todo.faltan === 0) return `${miles(o.altura)} bloques con todas sus firmas revisadas en tu navegador`;
  return `${miles(o.altura)} bloques encadenados y recontados en tu navegador`;
}

/** dibujarTodo es el botón de verificar toda la cadena y cuánto le falta. */
function dibujarTodo({ todo, altura }) {
  $('verificar-todo').hidden = todo.pedida;
  $('todo-avance').hidden = !todo.faltan;
  if (!todo.faltan) return;
  $('todo-texto').textContent = `Revisando las firmas de toda la cadena: faltan ${miles(todo.faltan)} de ${miles(altura)} bloques.`;
  $('todo-barra').value = 1 - todo.faltan / altura;
}

function dibujarVerificacion(o) {
  const problema = problemaDe(o);
  $('verif-titulo').textContent = problema ? `La verificación encontró un problema: ${problema}` : tituloDe(o);
  $('verif-titulo').className = problema ? 'error' : '';
  $('verif-detalle').textContent = `El último bloque lleva la firma de los 2 validadores (${o.validadores.map(corto).join(' · ')}) y amarra a todos los anteriores: si uno cambiara, dejaría de encadenar. El recuento se hace aquí.`;
  $('verif-limite').hidden = Boolean(o.vista) || o.todo.faltan === 0;
  dibujarTodo(o);
  const s = o.nodoEstado;
  $('nodo').textContent = `Nodo: bloque ${miles(s.height)} · ${s.peer_healthy ? 'los 2 validadores en línea' : 'esperando al segundo validador'} · confirma en ~${Math.round(s.p95_finality_ms)} ms`;
  $('nodo-distinto').hidden = !o.nodoDistinto;
  $('ayuda-marcados').hidden = !o.vista || o.vista.hidden;
  $('ayuda-secreta').hidden = !o.elecciones.some((v) => v.hidden);
}

function dibujar(o, nuevas) {
  $('carga').hidden = true;
  $('contenido').hidden = false;
  $('portada').hidden = Boolean(o.eleccion);
  $('votacion').hidden = !o.vista;
  $('no-esta').hidden = !o.eleccion || Boolean(o.vista);
  $('enlace-malo').hidden = Boolean(o.eleccion) || location.hash.length <= 1;
  if (!o.eleccion) dibujarPortada(o);
  if (o.vista) dibujarVotacion(o.vista);
  dibujarEstados(o);
  dibujarVerificacion(o);
  dibujarFeed(o, nuevas);
}

let ultima = null;

/** nuevasDe son los bloques que entraron desde la última vista. */
function nuevasDe(foto) {
  const antes = ultima?.altura ?? foto.altura;
  return new Set(foto.feed.map((f) => f.altura).filter((h) => h > antes));
}

/** Qué hace la página con cada aviso del trabajador. */
const AVISOS = {
  avance({ altura, alto }) {
    $('carga-texto').textContent = `Bloque ${miles(altura)} de ${miles(alto)}: encadenando y recontando.`;
    $('carga-barra').value = altura / Math.max(alto, 1);
  },
  vista({ foto }) {
    const nuevas = nuevasDe(foto);
    const cambio = ultima && ultima.eleccion !== foto.eleccion;
    ultima = foto;
    $('latido').textContent = 'en vivo';
    dibujar(foto, nuevas);
    if (cambio) window.scrollTo(0, 0);
  },
  corte({ texto }) {
    $('latido').textContent = `sin conexión con el nodo; reintento… (${texto})`;
  },
  falla({ texto }) {
    fallar(texto);
  },
};

/** seguir verifica en un Web Worker: la página solo dibuja y no se congela (FND-010). */
function seguir() {
  const trabajador = new Worker(new URL('trabajador.js', import.meta.url), { type: 'module' });
  const enviar = (mensaje) => trabajador.postMessage({ ...mensaje, visible: !document.hidden });
  trabajador.onmessage = ({ data }) => AVISOS[data.tipo](data);
  trabajador.onerror = () => fallar('Este navegador no pudo cargar el verificador. Actualízalo o prueba con otro.');
  const datos = { nodo: meta('mivoto-nodo'), validadores: meta('mivoto-validadores').split(','), eleccion: eleccionDe(location.hash) };
  enviar({ tipo: 'seguir', datos });
  document.addEventListener('visibilitychange', () => enviar({ tipo: 'visible' }));
  $('verificar-todo').addEventListener('click', () => enviar({ tipo: 'todo' }));
  window.addEventListener('hashchange', () => enviar({ tipo: 'ver', eleccion: eleccionDe(location.hash) }));
}

seguir();
setInterval(() => {
  if (ultima) dibujarEstados(ultima);
}, 1000);
