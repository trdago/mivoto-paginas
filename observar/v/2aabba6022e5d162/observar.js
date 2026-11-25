// Interfaz del observador: dibuja lo que verifica el Web Worker (trabajador.js), la portada con todas las elecciones,
// una sola (#<elección>), la mesa de un acta (#acta/<token>) o las actas sin elección (#actas). Todo texto que viene de la cadena entra con textContent, nunca como HTML.
import { actaDe, cierre, deTipo, eleccionDe, estadoDe, filasResultado, hayActas, huella, lecturaDeArchivo, lecturaDeMesa, listado, participacion, revisadas, sueltasDe } from './nucleo.js';

const $ = (id) => document.getElementById(id);
const meta = (nombre) => document.querySelector(`meta[name="${nombre}"]`).content;
const corto = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const miles = (n) => n.toLocaleString('es-CL');
const hora = (ms) => new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fecha = (ms) => new Date(ms).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const MODOS = { secreto: 'Normal · voto secreto', urfa: 'URFA', actas: 'Respaldo de actas' };
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

/** tarjetaDe es una elección en la portada: lleva a ella y muestra cómo va, o cómo terminó. */
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
function dibujarGrupo(id, filas, tarjeta = tarjetaDe) {
  const firma = JSON.stringify(filas.map(({ height, ...v }) => v));
  $(id).hidden = filas.length === 0 && id !== 'en-curso';
  if (firmas[id] === firma) return;
  firmas[id] = firma;
  const foco = document.activeElement?.getAttribute('href');
  $(id).querySelector('.lista').replaceChildren(...filas.map(tarjeta));
  $(id).querySelector('.vacio')?.toggleAttribute('hidden', filas.length > 0);
  if (foco?.length > 1) $(id).querySelector(`a[href="${CSS.escape(foco)}"]`)?.focus();
}

const contar = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;

/** tarjetaDeMesa lleva a una mesa con actas tokenizadas y dice si sus totales difieren. */
function tarjetaDeMesa(m) {
  const a = el('a', 'votacion');
  a.href = `#acta/${m.id}`;
  const fila = el('div', 'fila');
  fila.append(el('strong', '', m.election ? m.mesa : `${m.mesa} · ${m.title}`));
  a.append(fila, el('div', 'suave', `${contar(m.tokens, 'token', 'tokens')} · ${contar(m.files, 'archivo distinto', 'archivos distintos')}`));
  if (m.differs) a.append(el('div', 'aviso', 'Con totales distintos'));
  return a;
}

/** dibujarActas son las mesas de una elección de respaldo, o de las actas sueltas: se buscan por código y se piden más. */
function dibujarActas({ actas, lista }) {
  dibujarGrupo('mesas', actas.list, tarjetaDeMesa);
  $('mesas').hidden = false;
  $('actas-cuantas').textContent = `${cuantasActas(actas)} No es un registro oficial.`;
  $('actas-nada').hidden = actas.mesas > 0;
  $('actas-buscar').hidden = actas.mesas <= 20;
  if (document.activeElement !== $('actas-texto')) $('actas-texto').value = lista.texto;
  $('actas-sin').hidden = actas.mesas === 0 || actas.found > 0;
  $('actas-mas').hidden = actas.list.length >= actas.found;
  $('actas-mas').textContent = `Ver más (${miles(actas.list.length)} de ${miles(actas.found)})`;
}

function cuantasActas({ tokens, mesas, differs }) {
  const distintas = differs ? ` ${contar(differs, 'mesa', 'mesas')} con totales distintos.` : '';
  return `${contar(tokens, 'acta tokenizada', 'actas tokenizadas')} de ${contar(mesas, 'mesa', 'mesas')}.${distintas}`;
}

const filaDe = (celdas) => {
  const tr = el('tr');
  tr.append(...celdas.map((c) => el('td', '', miles(c))));
  return tr;
};

function tokenDe(t) {
  const li = el('li', t.requested ? 'bloque propio' : 'bloque');
  const firma = t.checked ? 'firma del teléfono revisada' : 'firma del teléfono por revisar';
  li.append(
    el('strong', '', `${miles(t.valid)} válidos · ${miles(t.blank)} blancos · ${miles(t.null)} nulos`),
    el('div', 'suave', `Bloque ${miles(t.height)} · ${firma}${t.requested ? ' · el de este enlace' : ''}`),
    el('div', 'mono suave', `Archivo ${t.checksum}`),
    el('div', 'mono suave', `Token ${t.tx}`),
  );
  return li;
}

function dibujarMesa(m) {
  document.title = `${m.mesa} · Observador · Mi Voto`;
  const lectura = lecturaDeMesa(m);
  $('mesa-volver').href = m.election ? `#${m.election}` : '#actas';
  $('mesa-volver').textContent = m.election ? `← ${m.title}` : '← Actas sin elección';
  $('mesa-titulo').textContent = `${m.mesa} · ${m.title}`;
  $('mesa-cuantos').textContent = `${contar(m.tokens, 'token', 'tokens')} · ${contar(m.files, 'archivo distinto', 'archivos distintos')}`;
  $('mesa-lectura').textContent = lectura.texto;
  $('mesa-lectura').className = lectura.aviso ? 'aviso' : 'suave';
  $('mesa-totales').tBodies[0].replaceChildren(...m.groups.map((g) => filaDe([g.valid, g.blank, g.null, g.sum, g.tokens])));
  $('mesa-tokens').replaceChildren(...m.list.map(tokenDe));
  $('mesa-mas').hidden = m.list.length === m.tokens;
  $('mesa-mas').textContent = `Se muestran los últimos ${miles(m.list.length)} de ${miles(m.tokens)}.`;
}

/** tokenHallado lleva a la mesa donde se tokenizó el archivo comprobado. */
function tokenHallado(t) {
  const a = el('a', 'votacion');
  a.href = `#acta/${t.tx}`;
  a.append(el('strong', '', `${t.mesa} · ${t.title}`), el('div', 'suave', `Bloque ${miles(t.height)}`));
  return a;
}

function dibujarArchivo(o) {
  const { archivo, altura } = o;
  $('comprobar').hidden = !hayActas(o);
  if (archivo?.checksum !== elegido.huella) return;
  const { esta, texto } = lecturaDeArchivo(archivo, altura);
  decirDelArchivo(texto, esta ? 'ok' : 'aviso');
  $('comprobado-huella').textContent = `Huella ${archivo.checksum}`;
  if ($('comprobado-tokens').children.length === archivo.tokens.length) return;
  $('comprobado-tokens').replaceChildren(...archivo.tokens.map(tokenHallado));
}

function decirDelArchivo(texto, clase) {
  $('comprobado').hidden = false;
  $('comprobado-texto').className = clase;
  if ($('comprobado-texto').textContent !== texto) $('comprobado-texto').textContent = texto;
}

function dibujarPortada(o) {
  document.title = 'Observador · Mi Voto';
  const tipo = document.querySelector('[name="tipo"]:checked').value;
  const grupos = listado(deTipo(o.elecciones, tipo), Date.now());
  for (const [id, grupo] of Object.entries(GRUPOS)) dibujarGrupo(id, grupos[grupo]);
  $('sueltas').hidden = o.sueltas.tokens === 0 || !['', 'actas'].includes(tipo);
  $('sueltas-cuantas').textContent = cuantasActas(o.sueltas);
}

function dibujarSueltas() {
  document.title = 'Actas sin elección · Observador · Mi Voto';
}

function dibujarVotacion(v) {
  document.title = `${v.title} · Observador · Mi Voto`;
  $('titulo').textContent = v.title;
  $('modo').textContent = MODOS[v.mode] ?? v.mode;
  dibujarCifras(v);
  $('seccion-resultado').hidden = v.mode === 'actas';
  $('resultado-oculto').hidden = !v.hidden;
  $('resultado').replaceChildren(...barrasDe(v));
}

/** dibujarEstados pone al día cuánto falta en cada elección a la vista; corre cada segundo. */
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

/** tituloDe dice qué se revisó de lo que se ve: la elección o la mesa con sus firmas, o la cadena. */
function tituloDe(o) {
  if (o.vista) return revisadas(o.vista).texto;
  if (o.mesa) return revisadas(o.mesa, 'esta mesa').texto;
  if (o.todo.faltan === 0) return `${miles(o.altura)} bloques con todas sus firmas revisadas en tu navegador`;
  return `${miles(o.altura)} bloques encadenados y recontados en tu navegador`;
}

/** dibujarTodo es el botón de verificar toda la cadena y cuánto le falta. */
function dibujarTodo({ todo, altura }) {
  const trabajando = todo.pedida && todo.faltan > 0;
  $('todo-pedir').hidden = todo.pedida || todo.faltan === 0;
  $('todo-avance').hidden = !trabajando;
  $('verificar-todo').textContent = todo.faltan > 0 ? `Seguir verificando (faltan ${miles(todo.faltan)} bloques)` : 'Verificar toda la cadena';
  if (!trabajando) return;
  $('todo-texto').textContent = `Tu aparato está revisando las firmas de toda la cadena: faltan ${miles(todo.faltan)} de ${miles(altura)} bloques.`;
  $('todo-barra').value = 1 - todo.faltan / altura;
}

function dibujarVerificacion(o) {
  const problema = problemaDe(o);
  $('verif-titulo').textContent = problema ? `La verificación encontró un problema: ${problema}` : tituloDe(o);
  $('verif-titulo').className = problema ? 'error' : '';
  $('verif-detalle').textContent = `El último bloque lleva la firma de los 2 validadores (${o.validadores.map(corto).join(' · ')}) y amarra a todos los anteriores: si uno cambiara, dejaría de encadenar. El recuento se hace aquí.`;
  $('verif-limite').hidden = Boolean(o.vista ?? o.mesa) || o.todo.faltan === 0;
  dibujarTodo(o);
  const s = o.nodoEstado;
  $('nodo').textContent = `Nodo: bloque ${miles(s.height)} · ${s.peer_healthy ? 'los 2 validadores en línea' : 'esperando al segundo validador'} · confirma en ~${Math.round(s.p95_finality_ms)} ms`;
  $('nodo-distinto').hidden = !o.nodoDistinto;
  $('ayuda-marcados').hidden = !o.vista || o.vista.hidden;
  $('ayuda-secreta').hidden = !o.elecciones.some((v) => v.hidden);
}

/** pedido es lo que trae el enlace: una elección, un acta o las actas sueltas; null en la portada. */
const pedido = (o) => o.acta ?? o.eleccion ?? (o.verSueltas ? 'sueltas' : null);

/** elegirVista deja a la vista la portada, la elección, sus actas o la mesa, o avisa que lo pedido no está. */
function elegirVista(o) {
  $('portada').hidden = Boolean(pedido(o));
  $('votacion').hidden = !o.vista;
  $('mesa').hidden = !o.mesa;
  $('sin-eleccion').hidden = !o.verSueltas;
  $('mesas').hidden = !o.actas;
  $('no-esta').hidden = !o.eleccion || Boolean(o.vista);
  $('acta-no-esta').hidden = !o.acta || Boolean(o.mesa);
  $('enlace-malo').hidden = Boolean(pedido(o)) || location.hash.length <= 1;
}

function dibujar(o, nuevas) {
  $('carga').hidden = true;
  $('contenido').hidden = false;
  elegirVista(o);
  if (!pedido(o)) dibujarPortada(o);
  if (o.vista) dibujarVotacion(o.vista);
  if (o.verSueltas) dibujarSueltas();
  if (o.actas) dibujarActas(o);
  if (o.mesa) dibujarMesa(o.mesa);
  dibujarArchivo(o);
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
    const cambio = ultima && pedido(ultima) !== pedido(foto);
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

const delEnlace = () => ({ eleccion: eleccionDe(location.hash), acta: actaDe(location.hash), sueltas: sueltasDe(location.hash) });

/** elegido es el último archivo elegido: mientras se calcula su huella no se muestra lo del anterior. */
const elegido = { veces: 0, huella: '' };

/** comprobar calcula aquí la huella del archivo elegido y la manda a buscar al trabajador: el archivo no sale. */
async function comprobar(campo, enviar) {
  const [archivo] = campo.files;
  if (!archivo) return;
  const vez = elegido.veces += 1;
  elegido.huella = '';
  $('comprobado-tokens').replaceChildren();
  $('comprobado-huella').textContent = '';
  decirDelArchivo('Calculando la huella…', 'suave');
  campo.value = ''; // para poder elegir el mismo archivo otra vez
  const { checksum, problema } = await huella(archivo).then((h) => ({ checksum: h }), (e) => ({ problema: e.message }));
  if (vez !== elegido.veces) return;
  if (problema) return decirDelArchivo(`No se pudo leer el archivo. ${problema}`, 'error');
  elegido.huella = checksum;
  enviar({ tipo: 'comprobar', checksum });
}

/** seguir verifica en un Web Worker: la página solo dibuja y no se congela (FND-010). */
function seguir() {
  const trabajador = new Worker(new URL('trabajador.js', import.meta.url), { type: 'module' });
  const enviar = (mensaje) => trabajador.postMessage({ ...mensaje, visible: !document.hidden });
  trabajador.onmessage = ({ data }) => AVISOS[data.tipo](data);
  trabajador.onerror = () => fallar('Este navegador no pudo cargar el verificador. Actualízalo o prueba con otro.');
  const datos = { nodo: meta('mivoto-nodo'), validadores: meta('mivoto-validadores').split(','), ...delEnlace() };
  enviar({ tipo: 'seguir', datos });
  document.addEventListener('visibilitychange', () => enviar({ tipo: 'visible' }));
  $('verificar-todo').addEventListener('click', () => enviar({ tipo: 'todo' }));
  $('detener-todo').addEventListener('click', () => enviar({ tipo: 'detener' }));
  window.addEventListener('hashchange', () => enviar({ tipo: 'ver', ...delEnlace() }));
  const listar = (cuantas) => enviar({ tipo: 'listar', texto: $('actas-texto').value, cuantas });
  $('actas-texto').addEventListener('input', () => listar(20));
  $('actas-mas').addEventListener('click', () => listar(ultima.lista.cuantas + 20));
  $('tipos').addEventListener('change', () => ultima && dibujarPortada(ultima));
  $('archivo').addEventListener('change', ({ target }) => comprobar(target, enviar));
}

seguir();
setInterval(() => {
  if (ultima) dibujarEstados(ultima);
}, 1000);
