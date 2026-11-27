// Interfaz del observador: dibuja lo que verifica el Web Worker (trabajador.js), la portada con todas las votaciones,
// una sola (#<elección>), la mesa de un acta (#acta/<token>), las actas sin elección (#actas), los sets de datos (#sets) o uno
// (#set/<token>). Todo texto que viene de la cadena entra con textContent, nunca como HTML.
// Lo que lee cualquiera sale de palabras.js, sin jerga; lo técnico va plegado en «Cómo se comprueba» (#tecnico).
import { aplicarModo, almacenDelNavegador, guardarModo, leerModo } from './modo.js';
import { deTipo, enlaceDe, filasResultado, hayArchivos, huella, listado } from './nucleo.js';
import {
  CERRADAS_A_LA_VISTA, MODOS, PANTALLA, avance, cierre, colorDe, computo, contar, cuantasActas, cuantos, deLaMesa, estadoDe, fecha,
  horaExacta, lecturaDeArchivo, lecturaDeMesa, miles, participacion, porcentaje, registro, revisadas, sello, testigos, verTodas,
} from './palabras.js';
import { dibujarComprobacion, dibujarSet, dibujarSets, tarjetaDeSet } from './vista_sets.js';

const $ = (id) => document.getElementById(id);
const meta = (nombre) => document.querySelector(`meta[name="${nombre}"]`).content;
const corto = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const GRUPOS = { 'en-curso': 'enCurso', 'por-empezar': 'porEmpezar', cerradas: 'cerradas' };

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** fallar deja de mostrar lo que había: nada se presenta como comprobado si algo no calza. */
function fallar(titulo, texto) {
  $('carga').hidden = true;
  $('contenido').hidden = true;
  $('falla').hidden = false;
  $('falla-titulo').textContent = titulo;
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

/**
 * columnasDe dibuja el cómputo como columnas, igual que la app: cada opción con su porcentaje grande arriba, su
 * columna del color que le toca por su orden, y abajo su nombre y sus votos.
 */
function columnasDe(vista) {
  const filas = filasResultado(vista);
  if (!filas.length) return [];
  const columnas = el('div', 'columnas');
  columnas.append(...filas.map((f, i) => {
    const o = el('div', f.gana ? 'opcion gana' : 'opcion');
    const marca = el('span', 'marca-gana');
    if (f.gana) marca.append(el('span', 'etiqueta', 'Gana'));
    const columna = el('div', 'columna');
    const relleno = el('i', colorDe(i));
    relleno.style.height = `${f.alto}%`;
    columna.append(relleno);
    o.append(marca, el('b', 'pct', porcentaje(f.pct)), columna, el('span', 'nombre', f.opcion),
      el('span', 'suave', cuantos(vista, f.votos)));
    return o;
  }));
  return [columnas];
}

/** pantallaGrande agranda el cómputo para proyectarlo; sin pantalla completa (iPhone) se agranda en la ventana. */
function pantallaGrande(activar) {
  document.body.classList.toggle('pantalla', activar);
  $('pantalla').textContent = activar ? PANTALLA.cerrar : PANTALLA.abrir;
  const pedido = activar ? document.documentElement.requestFullscreen?.() : document.fullscreenElement && document.exitFullscreen();
  Promise.resolve(pedido).catch(() => {});
}

const enPantalla = () => document.body.classList.contains('pantalla');

function dibujarFeed(o, nuevas) {
  $('feed').replaceChildren(
    ...o.feed.map((f) => {
      const li = el('li', ['bloque', f.propias ? 'propio' : '', nuevas.has(f.altura) ? 'nuevo' : ''].join(' ').trim());
      const fila = el('div', 'fila');
      fila.append(el('strong', '', `Bloque ${miles(f.altura)}`), el('span', 'mono suave', corto(f.hash)));
      const txs = f.txs === null ? '' : `${miles(f.txs)} tx · `;
      li.append(fila, el('div', 'suave', `${horaExacta(f.hora)} · ${txs}firmado ${f.firmas}/2`));
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
  if (!v.closed) a.append(...columnasDe(v));
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

/** tarjetaDeMesa lleva a una mesa con actas registradas y dice si sus totales difieren. */
function tarjetaDeMesa(m) {
  const a = el('a', 'votacion');
  a.href = `#acta/${m.id}`;
  const fila = el('div', 'fila');
  fila.append(el('strong', '', m.election ? m.mesa : `${m.mesa} · ${m.title}`));
  a.append(fila, el('div', 'suave', deLaMesa(m)));
  if (m.differs) a.append(el('div', 'aviso', 'Con totales distintos'));
  return a;
}

/** dibujarActas son las mesas de una votación de respaldo, o de las actas sueltas: se buscan por código y se piden más. */
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

const filaDe = (celdas) => {
  const tr = el('tr');
  tr.append(...celdas.map((c) => el('td', '', miles(c))));
  return tr;
};

/** tokenDe es un registro del acta: sus totales y cuándo se registró; lo técnico, plegado. */
function tokenDe(t) {
  const li = el('li', t.requested ? 'bloque propio' : 'bloque');
  const tecnico = el('details');
  tecnico.append(
    el('summary', '', 'Datos técnicos'),
    el('div', 'suave', `Bloque ${miles(t.height)}`),
    el('div', 'mono suave', `Archivo ${t.checksum}`),
    el('div', 'mono suave', `Token ${t.tx}`),
  );
  li.append(el('strong', '', `${miles(t.valid)} válidos · ${miles(t.blank)} blancos · ${miles(t.null)} nulos`), el('div', 'suave', registro(t)), tecnico);
  return li;
}

function dibujarMesa(m) {
  document.title = `${m.mesa} · Observador · Mi Voto`;
  const lectura = lecturaDeMesa(m);
  $('mesa-volver').href = m.election ? `#${m.election}` : '#actas';
  $('mesa-volver').textContent = m.election ? `← ${m.title}` : '← Actas sin votación';
  $('mesa-titulo').textContent = `${m.mesa} · ${m.title}`;
  $('mesa-cuantos').textContent = deLaMesa(m);
  $('mesa-lectura').textContent = lectura.texto;
  $('mesa-lectura').className = lectura.aviso ? 'aviso' : 'suave';
  $('mesa-totales').tBodies[0].replaceChildren(...m.groups.map((g) => filaDe([g.valid, g.blank, g.null, g.sum, g.tokens])));
  $('mesa-tokens').replaceChildren(...m.list.map(tokenDe));
  $('mesa-mas').hidden = m.list.length === m.tokens;
  $('mesa-mas').textContent = `Se muestran los últimos ${miles(m.list.length)} de ${miles(m.tokens)}.`;
}

/** tokenHallado lleva a la mesa donde se registró el archivo comprobado. */
function tokenHallado(t) {
  const a = el('a', 'votacion');
  a.href = `#acta/${t.tx}`;
  a.append(el('strong', '', `${t.mesa} · ${t.title}`), el('div', 'suave', `Registrada el ${fecha(t.at)}`));
  return a;
}

function dibujarArchivo(o) {
  const { archivo } = o;
  $('comprobar').hidden = !hayArchivos(o) || Boolean(o.enlace.set);
  if (archivo?.checksum !== elegido.huella) return;
  const { esta, texto } = lecturaDeArchivo(archivo);
  decirDelArchivo(texto, esta ? 'ok' : 'aviso');
  $('comprobado-huella').textContent = `Huella técnica (SHA-256): ${archivo.checksum}`;
  if ($('comprobado-tokens').children.length === archivo.tokens.length + archivo.sets.length) return;
  $('comprobado-tokens').replaceChildren(...archivo.tokens.map(tokenHallado), ...archivo.sets.map(tarjetaDeSet));
}

function decirDelArchivo(texto, clase) {
  $('comprobado').hidden = false;
  $('comprobado-texto').className = clase;
  if ($('comprobado-texto').textContent !== texto) $('comprobado-texto').textContent = texto;
}

/** todasCerradas: quien pidió «Ver todas» ve todas las cerradas; si no, solo las más recientes. */
let todasCerradas = false;

function dibujarPortada(o) {
  document.title = 'Observador · Mi Voto';
  const tipo = document.querySelector('[name="tipo"]:checked').value;
  const grupos = listado(deTipo(o.elecciones, tipo), Date.now());
  const cerradas = grupos.cerradas.length;
  if (!todasCerradas) grupos.cerradas = grupos.cerradas.slice(0, CERRADAS_A_LA_VISTA);
  for (const [id, grupo] of Object.entries(GRUPOS)) dibujarGrupo(id, grupos[grupo]);
  $('ver-todas').hidden = grupos.cerradas.length === cerradas;
  $('ver-todas').textContent = verTodas(cerradas);
  $('sueltas').hidden = o.sueltas.tokens === 0 || !['', 'actas'].includes(tipo);
  $('sueltas-cuantas').textContent = cuantasActas(o.sueltas);
  $('sets-sueltos').hidden = o.setsSueltos.total === 0 || tipo !== '';
  $('sets-sueltos-cuantos').textContent = contar(o.setsSueltos.total, 'set registrado', 'sets registrados');
}

function dibujarSueltas() {
  document.title = 'Actas sin votación · Observador · Mi Voto';
}

function dibujarSetsSueltos() {
  document.title = 'Sets de datos · Observador · Mi Voto';
}

function dibujarVotacion(v) {
  document.title = `${v.title} · Observador · Mi Voto`;
  $('titulo').textContent = v.title;
  $('modo').textContent = MODOS[v.mode] ?? v.mode;
  dibujarCifras(v);
  $('testigos').textContent = testigos(v);
  $('testigos').hidden = !testigos(v);
  $('seccion-resultado').hidden = v.mode === 'actas';
  $('resultado-oculto').hidden = !v.hidden;
  $('resultado').replaceChildren(...columnasDe(v));
  const c = computo(v);
  $('computo').hidden = !c;
  $('computo-etiqueta').textContent = c?.etiqueta ?? '';
  $('computo-contados').textContent = c?.contados ?? '';
}

/** dibujarEstados pone al día cuánto falta en cada votación a la vista y el sello; corre cada segundo. */
function dibujarEstados(o) {
  const ahora = Date.now();
  if (o.vista) $('estado').textContent = estadoDe(o.vista, ahora).texto;
  for (const v of o.elecciones) {
    const tarjeta = document.querySelector(`[data-estado="${v.id}"]`);
    if (tarjeta) tarjeta.textContent = estadoDe(v, ahora).texto;
  }
  dibujarSello(o, ahora);
}

function problemaDe(o) {
  const revisadasDe = o.vista ? [o.vista] : o.elecciones;
  return revisadasDe.map((v) => v.invariants).find(Boolean);
}

/** revisionDe es cuánto se revisó de las firmas de lo que se mira: la votación o la mesa; nada en la portada. */
function revisionDe(o) {
  if (o.vista) return revisadas(o.vista);
  if (o.mesa) return revisadas(o.mesa, 'esta mesa');
  return null;
}

/** conexion es desde cuándo vale lo que se ve, y si se perdió el contacto con la red. */
const conexion = { corte: false, desde: Date.now() };

function dibujarSello(o, ahora) {
  const s = sello({ problema: problemaDe(o), ...conexion, ahora, revision: revisionDe(o) });
  $('sello').className = `tarjeta sello ${s.clase}`.trim();
  $('sello-marca').style.display = s.clase === 'ok' ? '' : 'none';
  if ($('sello-titulo').textContent !== s.titulo) $('sello-titulo').textContent = s.titulo;
  $('sello-detalle').textContent = s.detalle;
}

/** tituloDe dice, en «Cómo se comprueba», qué se revisó de lo que se ve: la elección o la mesa con sus firmas, o la cadena. */
function tituloDe(o) {
  if (o.vista) return revisadas(o.vista).texto;
  if (o.mesa) return revisadas(o.mesa, 'esta mesa').texto;
  if (o.set) return o.set.checked ? 'El bloque de este set tiene sus firmas revisadas en tu navegador.' : 'Revisando la firma de este set…';
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
  $('verif-limite').hidden = Boolean(o.vista ?? o.mesa ?? o.set) || o.todo.faltan === 0;
  dibujarTodo(o);
  const s = o.nodoEstado;
  $('nodo').textContent = `Nodo: bloque ${miles(s.height)} · ${s.peer_healthy ? 'los 2 validadores en línea' : 'esperando al segundo validador'} · confirma en ~${Math.round(s.p95_finality_ms)} ms`;
  $('nodo-distinto').hidden = !o.nodoDistinto;
  $('ayuda-marcados').hidden = !o.vista || o.vista.hidden;
  $('ayuda-secreta').hidden = !o.elecciones.some((v) => v.hidden);
}

/** pedido es lo que trae el enlace; null en la portada. */
const pedido = ({ enlace: e }) => e.acta ?? e.set ?? e.eleccion ?? (e.sueltas ? 'sueltas' : null) ?? (e.sets ? 'sets' : null);

/** elegirVista deja a la vista la portada, la votación, sus actas, la mesa, los sets o uno, o avisa que lo pedido no está. */
function elegirVista(o) {
  $('intro').hidden = Boolean(pedido(o));
  $('portada').hidden = Boolean(pedido(o));
  $('votacion').hidden = !o.vista;
  $('mesa').hidden = !o.mesa;
  $('sin-eleccion').hidden = !o.enlace.sueltas;
  $('sets-portada').hidden = !o.enlace.sets;
  $('sets-lista').hidden = !o.sets;
  $('un-set').hidden = !o.set;
  $('mesas').hidden = !o.actas;
  $('no-esta').hidden = !o.enlace.eleccion || Boolean(o.vista);
  $('acta-no-esta').hidden = !o.enlace.acta || Boolean(o.mesa);
  $('set-no-esta').hidden = !o.enlace.set || Boolean(o.set);
  $('enlace-malo').hidden = Boolean(pedido(o)) || location.hash.length <= 1;
}

function dibujarUnSet(o) {
  dibujarSet(o.set);
  dibujarComprobacion(o);
}

function dibujar(o, nuevas) {
  $('carga').hidden = true;
  $('contenido').hidden = false;
  elegirVista(o);
  if (!pedido(o)) dibujarPortada(o);
  if (o.vista) dibujarVotacion(o.vista);
  if (o.enlace.sueltas) dibujarSueltas();
  if (o.enlace.sets) dibujarSetsSueltos();
  if (o.sets) dibujarSets(o, dibujarGrupo);
  if (o.set) dibujarUnSet(o);
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
    $('carga-texto').textContent = avance(altura, alto);
    $('carga-barra').value = altura / Math.max(alto, 1);
  },
  vista({ foto }) {
    const nuevas = nuevasDe(foto);
    const cambio = ultima && pedido(ultima) !== pedido(foto);
    ultima = foto;
    Object.assign(conexion, { corte: false, desde: Date.now() });
    $('latido').textContent = 'en vivo';
    dibujar(foto, nuevas);
    if (cambio) window.scrollTo(0, 0);
  },
  corte({ texto }) {
    conexion.corte = true;
    $('latido').textContent = `sin conexión con el nodo; reintento… (${texto})`;
    if (ultima) dibujarSello(ultima, Date.now());
  },
  falla({ texto }) {
    fallar('Algo no calza', `Tu navegador encontró algo que no verifica, así que no se muestra nada. Detalle técnico: ${texto}`);
  },
};

const delEnlace = () => enlaceDe(location.hash);

/** compararSet le pasa el archivo elegido al trabajador, que lo lee en este aparato: no sale de él. */
function compararSet(campo, enviar) {
  const [archivo] = campo.files;
  if (!archivo) return;
  enviar({ tipo: 'comprobarSet', archivo });
  campo.value = ''; // para poder elegir el mismo archivo otra vez
}

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
  decirDelArchivo('Comparando…', 'suave');
  campo.value = ''; // para poder elegir el mismo archivo otra vez
  const { checksum, problema } = await huella(archivo).then((h) => ({ checksum: h }), (e) => ({ problema: e.message }));
  if (vez !== elegido.veces) return;
  if (problema) return decirDelArchivo(`No se pudo leer el archivo. ${problema}`, 'error');
  elegido.huella = checksum;
  enviar({ tipo: 'comprobar', checksum });
}

/** puedeComprobar: sin WebAssembly ni Web Workers el navegador no puede comprobar nada, y no se muestra nada sin comprobar. */
const puedeComprobar = () => typeof WebAssembly === 'object' && typeof Worker === 'function';

/** seguir verifica en un Web Worker: la página solo dibuja y no se congela (FND-010). */
function seguir() {
  if (!puedeComprobar()) return fallar('Este navegador no puede comprobar', 'Actualízalo o prueba con otro: sin comprobar, la página no muestra nada.');
  const trabajador = new Worker(new URL('trabajador.js', import.meta.url), { type: 'module' });
  const enviar = (mensaje) => trabajador.postMessage({ ...mensaje, visible: !document.hidden });
  trabajador.onmessage = ({ data }) => AVISOS[data.tipo](data);
  trabajador.onerror = () => fallar('Este navegador no puede comprobar', 'No pudo cargar el comprobador. Actualízalo o prueba con otro.');
  const datos = { nodo: meta('mivoto-nodo'), validadores: meta('mivoto-validadores').split(','), ...delEnlace() };
  enviar({ tipo: 'seguir', datos });
  document.addEventListener('visibilitychange', () => enviar({ tipo: 'visible' }));
  $('verificar-todo').addEventListener('click', () => enviar({ tipo: 'todo' }));
  $('detener-todo').addEventListener('click', () => enviar({ tipo: 'detener' }));
  const almacen = almacenDelNavegador();
  const modo = $('modo-color');
  modo.value = leerModo(almacen);
  aplicarModo(document.documentElement, modo.value);
  modo.addEventListener('change', () => {
    guardarModo(almacen, modo.value);
    aplicarModo(document.documentElement, modo.value);
  });
  window.addEventListener('hashchange', () => enPantalla() && pantallaGrande(false));
  window.addEventListener('hashchange', () => enviar({ tipo: 'ver', enlace: delEnlace() }));
  $('pantalla').textContent = PANTALLA.abrir;
  $('pantalla-aviso').textContent = PANTALLA.aviso;
  $('pantalla').addEventListener('click', () => pantallaGrande(!enPantalla()));
  document.addEventListener('fullscreenchange', () => !document.fullscreenElement && enPantalla() && pantallaGrande(false));
  const listar = (cuantas) => enviar({ tipo: 'listar', texto: $('actas-texto').value, cuantas });
  $('actas-texto').addEventListener('input', () => listar(20));
  $('actas-mas').addEventListener('click', () => listar(ultima.lista.cuantas + 20));
  $('tipos').addEventListener('change', () => ultima && dibujarPortada(ultima));
  $('ver-todas').addEventListener('click', () => {
    todasCerradas = true;
    dibujarPortada(ultima);
  });
  $('archivo').addEventListener('change', ({ target }) => comprobar(target, enviar));
  $('archivo-set').addEventListener('change', ({ target }) => compararSet(target, enviar));
  $('sets-mas').addEventListener('click', () => enviar({ tipo: 'masSets' }));
  return undefined;
}

seguir();
setInterval(() => {
  if (ultima) dibujarEstados(ultima);
}, 1000);
