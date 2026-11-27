// Sets de datos cuyo texto esta página no muestra: ofensivo, o con datos de personas (docs/adr/0008). Es una lista pública y
// versionada: se quita el texto, con los totales, y se deja la huella, diciéndolo. La cadena, la app y la auditoría no cambian.
// Cada línea lleva el token (64 hex) y, en un comentario, la fecha y el motivo, sin repetir el texto.
export const OCULTOS = new Set([]);

export const TAPADO = 'Texto oculto por Mi Voto';

/** tapar quita lo que escribió quien firmó un set de la lista: título, descripción, nombres de columnas y totales (que pueden ser un RUT). */
export function tapar(set, ocultos = OCULTOS) {
  if (!ocultos.has(set.tx)) return set;
  const tapado = { ...set, oculto: true, title: TAPADO, description: '' };
  if (!Array.isArray(set.columns)) return tapado;
  return { ...tapado, columns: set.columns.map((c, i) => ({ ...c, name: `Columna ${i + 1}`, total: '' })) };
}

/** taparEvento hace lo mismo con los sets que nombra la lista de bloques. */
export const taparEvento = (e, ocultos = OCULTOS) => (e.sets ? { ...e, sets: e.sets.map((s) => tapar(s, ocultos)) } : e);
