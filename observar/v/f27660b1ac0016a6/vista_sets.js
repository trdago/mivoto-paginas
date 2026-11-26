// Dibuja los sets de datos: la lista, la ficha de uno y lo que salió de comprobar un archivo. Todo con textContent.
import { miles } from './palabras.js';
import { columnaDe, contar, lecturaDeComprobacion, lecturaFirmada, resumenDe } from './sets.js';

const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** tarjetaDeSet lleva a la ficha de un set. */
export function tarjetaDeSet(s) {
  const a = el('a', 'votacion');
  a.href = `#set/${s.tx}`;
  a.append(el('strong', '', s.title), el('div', 'suave', resumenDe(s)));
  if (s.replaced_by) a.append(el('div', 'aviso', 'Reemplazado por otro'));
  return a;
}

/** dibujarSets son los sets de una elección, o los sueltos. */
export function dibujarSets({ sets, enlace }, dibujarGrupo) {
  $('sets-lista').hidden = !enlace.sets && sets.total === 0;
  $('sets-cuantos').textContent = sets.total === 0 ? 'Nadie ha registrado sets de datos aquí todavía.' : contar(sets.total, 'set registrado', 'sets registrados');
  dibujarGrupo('sets-lista', sets.list, tarjetaDeSet);
  $('sets-lista').hidden = !enlace.sets && sets.total === 0;
  $('sets-mas').hidden = sets.list.length >= sets.total;
  $('sets-mas').textContent = `Ver más (${miles(sets.list.length)} de ${miles(sets.total)})`;
}

function dato(nombre, valor, clase = '') {
  const li = el('li', 'bloque');
  li.append(el('div', 'suave', nombre), el('div', clase, valor));
  return li;
}

function enlazado(nombre, destino, texto) {
  const li = el('li', 'bloque');
  const a = el('a', '', texto);
  a.href = destino;
  li.append(el('div', 'suave', nombre), a);
  return li;
}

function datosDe(s) {
  return [
    s.election && enlazado('Elección', `#${s.election}`, s.election_title),
    s.replaces && enlazado('Reemplaza a', `#set/${s.replaces}`, 'un set anterior del mismo teléfono'),
    s.replaced_by && enlazado('Reemplazado por', `#set/${s.replaced_by}`, 'un set más nuevo del mismo teléfono'),
    dato('Tamaño del archivo', `${miles(s.size)} bytes`),
    dato('Cómo se leyó', lecturaFirmada(s)),
    dato('Huella del archivo (SHA-256)', s.checksum, 'mono'),
    dato('Teléfono que lo firmó', s.device, 'mono'),
    dato('Código del set', s.tx, 'mono'),
    dato('Bloque', `${miles(s.height)} · ${s.checked ? 'firma del teléfono revisada' : 'firma del teléfono por revisar'}`),
    s.same_file > 1 && dato('El mismo archivo', `lo registraron ${miles(s.same_file)} teléfonos`),
  ].filter(Boolean);
}

function columna([nombre, trae, total]) {
  const li = el('li', 'bloque');
  li.append(el('strong', '', nombre), el('div', 'suave', trae));
  if (total) li.append(el('div', '', total));
  return li;
}

/** dibujarSet es la ficha de un set. */
export function dibujarSet(s) {
  document.title = `${s.title} · Observador · Mi Voto`;
  $('set-volver').href = s.election ? `#${s.election}` : '#sets';
  $('set-volver').textContent = s.election ? `← ${s.election_title}` : '← Sets de datos';
  $('set-titulo').textContent = s.title;
  $('set-resumen').textContent = resumenDe(s);
  $('set-descripcion').textContent = s.description;
  $('set-oculto').hidden = !s.oculto;
  $('set-datos').replaceChildren(...datosDe(s));
  $('set-columnas').hidden = s.columns.length === 0;
  $('set-lista-columnas').replaceChildren(...s.columns.map((c) => columna(columnaDe(c))));
}

const ESTADOS = {
  leyendo: () => ({ clase: 'suave', texto: 'Leyendo el archivo en tu aparato…', diferencias: [] }),
  error: (c) => ({ clase: 'error', texto: `No se pudo leer el archivo. ${c.texto}`, diferencias: [] }),
  listo: (c, oculto) => lecturaDeComprobacion(c, Boolean(oculto)),
};

/** dibujarComprobacion dice qué salió del archivo elegido en la ficha. */
export function dibujarComprobacion({ comprobacion, set }) {
  const propia = comprobacion?.tx === set.tx; // la cadena puede estar a medio bajar y verse todavía el set anterior
  $('set-comprobado').hidden = !propia;
  if (!propia) return;
  const { clase, texto, diferencias } = ESTADOS[comprobacion.estado](comprobacion, set.oculto);
  $('set-comprobado-texto').className = clase;
  if ($('set-comprobado-texto').textContent !== texto) $('set-comprobado-texto').textContent = texto;
  $('set-diferencias').replaceChildren(...diferencias.map((d) => el('li', 'bloque', d)));
}
