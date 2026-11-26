// Lo que la página dice de un set de datos y de un archivo comprobado contra él. Sin DOM, para probarlo en node.
import { miles } from './palabras.js';

const CLASES = { padron: 'Padrón de prueba', mesas: 'Mesas', escenario: 'Escenario', otro: 'Otro' };
const FORMATOS = { csv: 'CSV', json: 'JSON', otro: 'Sin columnas' };
const SEPARADORES = { ',': 'coma', ';': 'punto y coma', '\t': 'tabulación' };
const DECIMALES = { ',': 'decimales con coma', '.': 'decimales con punto' };

const claseDe = (set) => CLASES[set.class] ?? set.class;
const formatoDe = (set) => FORMATOS[set.format] ?? set.format;

export const contar = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;

/** resumenDe es un set en una línea: qué es y cuánto trae. */
export function resumenDe(set) {
  const columnas = typeof set.columns === 'number' ? set.columns : set.columns.length;
  const tamano = columnas ? [contar(set.rows, 'fila', 'filas'), contar(columnas, 'columna', 'columnas')] : [];
  return [claseDe(set), formatoDe(set), ...tamano].join(' · ');
}

/** lecturaFirmada dice cómo se leyó el archivo: con eso cualquiera que lo tenga calcula lo mismo. */
export function lecturaFirmada({ format, reading }) {
  if (format === 'otro') return 'No se publicaron columnas: solo con qué reconocer el archivo y su tamaño.';
  if (format === 'json') return `Se leyó como JSON (forma de leer ${reading.version}).`;
  const primera = reading.header ? 'la primera fila son los nombres' : 'la primera fila ya son datos';
  return `Se leyó como CSV separado por ${SEPARADORES[reading.separator] ?? reading.separator}, ${reading.encoding}; ${primera} (forma de leer ${reading.version}).`;
}

/** totalDe escribe un total como se escribe en Chile: «1234.25» → «1.234,25». */
export function totalDe(total) {
  const [entero, ...decimales] = total.split('.');
  return [entero.replace(/\d(?=(\d{3})+$)/g, '$&.'), ...decimales].join(',');
}

/** columnaDe son el nombre, qué trae y el total de una columna. */
export function columnaDe(c) {
  const tipo = c.type === 'numero' ? ['Números', DECIMALES[c.decimal]].filter(Boolean).join(', ') : 'Texto';
  return [c.name, `${tipo} · ${contar(c.empty, 'vacía', 'vacías')}`, c.total === '' ? '' : `Total: ${totalDe(c.total)}`];
}

const LECTURAS = {
  otro_archivo: { clase: 'aviso', texto: 'Este archivo no es el que se registró. Eso no dice cuál está bien: basta un cambio mínimo, o volver a guardarlo con otro programa, para que sea otro archivo.' },
  solo_huella: { clase: 'ok', texto: 'Es exactamente el mismo archivo que se registró. De este set no se publicaron columnas ni totales que comparar.' },
  no_puede_recalcular: { clase: 'aviso', texto: 'Es exactamente el mismo archivo que se registró. Esta página no conoce la forma en que se leyó, así que no puede volver a calcular sus columnas y totales.' },
  calza: { clase: 'ok', texto: 'Es exactamente el mismo archivo que se registró, y las columnas, las filas y los totales publicados salen de él.' },
  no_calza: { clase: 'error', texto: 'Es exactamente el mismo archivo que se registró, pero lo publicado no es lo que sale de él.' },
};

const VER_DIFERENCIAS = { true: ' Su texto está oculto: no se muestra en qué se diferencia.', false: ' Se diferencia en:' };

/** lecturaDeComprobacion dice en palabras qué salió de comprobar un archivo. Lo que no conoce nunca lo da por malo. */
export function lecturaDeComprobacion({ same_file: mismo, result, differences }, oculto = false) {
  if (!mismo) return { ...LECTURAS.otro_archivo, diferencias: [] };
  const { clase, texto } = LECTURAS[result] ?? LECTURAS.no_puede_recalcular;
  if (result !== 'no_calza') return { clase, texto, diferencias: [] };
  return { clase, texto: texto + VER_DIFERENCIAS[oculto], diferencias: oculto ? [] : differences };
}
