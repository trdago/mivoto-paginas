// Palabras del observador para quien no sabe de criptografía: todo texto de la vista principal sale de aquí, sin
// jerga (JERGA). Lo técnico (bloques, firmas de los validadores, la cadena en vivo) va en «Cómo se comprueba».
// Sin DOM, para probarlo en node (observar_test.mjs).

/** JERGA son las palabras que no van en la vista principal: solo en «Cómo se comprueba». */
export const JERGA = /(^|[^\p{L}])(hash|tx|bloque|sha-?256|validador|nodo|token|tokeniz|transacci|blockchain|cadena|webassembly|votocore|credencial|huella)/iu;

export const miles = (n) => n.toLocaleString('es-CL', { useGrouping: 'always' });
// La guía de voz (marca/voz.md) fija la hora de 24 h: es-CL la escribe con «a. m.» si no se le pide.
const HORA = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
export const fecha = (ms) => new Date(ms).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', ...HORA });
export const hora = (ms) => new Date(ms).toLocaleTimeString('es-CL', HORA);
export const horaExacta = (ms) => new Date(ms).toLocaleTimeString('es-CL', { ...HORA, second: '2-digit' });
export const contar = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;

export const MODOS = { secreto: 'Voto secreto', urfa: 'Votos ilimitados (URFA)', actas: 'Respaldo de actas' };

/** CERRADAS_A_LA_VISTA es cuántas votaciones cerradas muestra la portada antes de «Ver todas». */
export const CERRADAS_A_LA_VISTA = 5;

export const verTodas = (n) => `Ver todas las cerradas (${miles(n)})`;

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
  if (h >= 48) return `${Math.floor(h / 24)} días`;
  if (h > 0) return `${h} h ${dos(m)} min`;
  return `${m}:${dos(s % 60)}`;
}

/** haceCuanto dice en palabras cuánto pasó desde la última comprobación. */
export function haceCuanto(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'recién';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

const CIFRAS = {
  secreto: [['voters', 'Persona votó', 'Personas votaron'], ['ballots', 'Voto secreto recibido', 'Votos secretos recibidos']],
  urfa: [['voters', 'Participante', 'Participantes'], ['ballots', 'Toque', 'Toques']],
  actas: [['tokens', 'Acta registrada', 'Actas registradas'], ['mesas', 'Mesa', 'Mesas']],
};

/** participacion son las cifras que se ven en vivo, también en una votación secreta abierta. */
export function participacion(vista) {
  return (CIFRAS[vista.mode] ?? CIFRAS.urfa).map(([campo, ...nombres]) => cifra(nombres, vista[campo]));
}

const cifra = ([uno, varios], valor) => ({ etiqueta: valor === 1 ? uno : varios, valor });

/**
 * testigos dice cuántos participantes co-firmaron lo que verificaron en su teléfono (ADR 0009), recontado desde los
 * bloques en este navegador: al cierre, «verificado por N de M»; abierta, cuántos van. Vacío en un respaldo de actas
 * y mientras ninguno co-firma una votación abierta.
 */
export function testigos(vista) {
  if (vista.mode === 'actas' || !vista.voters) return '';
  const n = vista.closed ? vista.closing_witnesses ?? 0 : vista.witnesses ?? 0;
  const m = `${miles(vista.voters)} ${vista.voters === 1 ? 'participante' : 'participantes'}`;
  if (vista.closed && n === 0) return vista.voters === 1 ? 'El único participante no co-firmó el cierre desde su teléfono.' : `Ninguno de los ${m} co-firmó el cierre desde su teléfono.`;
  if (vista.closed) return `Verificado en sus teléfonos por ${miles(n)} de ${m}.`;
  if (n === 0) return '';
  return `${miles(n)} de ${m} ${n === 1 ? 'co-firmó' : 'co-firmaron'} lo que verificó en su teléfono, hasta ahora.`;
}

/** cierre dice en una línea cómo terminó una votación; vacío si no ha cerrado, o si respalda actas. */
export function cierre(vista) {
  if (!vista.closed || vista.mode === 'actas') return '';
  if (vista.winner >= 0) return `Ganó «${vista.options[vista.winner]}»`;
  return vista.ballots > 0 ? 'Empate' : 'Sin votos';
}

/** revisadas dice en palabras si ya se revisó la firma de cada registro de la votación (o mesa). */
export function revisadas(vista, de = 'esta votación') {
  if (vista.txs_checked >= vista.txs) {
    return { completa: true, texto: `Se revisó la firma de ${vista.txs === 1 ? 'su único registro' : `cada uno de los ${miles(vista.txs)} registros`} de ${de}.` };
  }
  return { completa: false, texto: `Revisando las firmas de ${de}: ${miles(vista.txs_checked)} de ${miles(vista.txs)}.` };
}

/** lecturaDeArchivo dice si el archivo elegido es el mismo que se registró, como acta o como set de datos, y cuándo. */
export function lecturaDeArchivo({ tokens, sets = [] }) {
  if (tokens.length + sets.length === 0) {
    return {
      esta: false,
      texto: 'Este archivo no está registrado en Mi Voto. Eso no prueba que sea falso: otra foto del mismo papel, la misma foto recortada o enviada por un chat que la comprime, o unos datos guardados de nuevo con otro programa, cuentan como otro archivo.',
    };
  }
  if (tokens.length === 0) return { esta: true, texto: comoSet(sets.length) };
  return { esta: true, texto: comoActa(tokens) + (sets.length ? ` También se registró como set de datos.` : '') };
}

const comoSet = (n) => (n === 1 ? 'Es el mismo archivo que se registró como set de datos.' : `Es el mismo archivo. Se registró ${miles(n)} veces como set de datos.`);

function comoActa(tokens) {
  const primera = Math.min(...tokens.map((t) => t.at));
  if (tokens.length === 1) return `Es el mismo archivo que se registró el ${fecha(primera)}.`;
  return `Es el mismo archivo. Se registró ${miles(tokens.length)} veces; la primera, el ${fecha(primera)}.`;
}

/** lecturaDeMesa dice en palabras qué se puede comparar de una mesa, sin elegir unos totales. */
export function lecturaDeMesa({ tokens, differs, groups }) {
  if (differs) {
    return { aviso: true, texto: `Hay ${groups.length} versiones de los totales. Mi Voto no dice cuál es la correcta: compáralas con el acta de papel.` };
  }
  if (tokens === 1) return { aviso: false, texto: 'La registró un solo teléfono: no hay con qué compararla.' };
  return { aviso: false, texto: `Los ${tokens} registros traen los mismos totales.` };
}

/** cuantasActas resume las actas de una votación de respaldo, o las sueltas. */
export function cuantasActas({ tokens, mesas, differs }) {
  const distintas = differs ? ` ${contar(differs, 'mesa', 'mesas')} con totales distintos.` : '';
  return `${contar(tokens, 'acta registrada', 'actas registradas')} de ${contar(mesas, 'mesa', 'mesas')}.${distintas}`;
}

export const deLaMesa = (m) => `${contar(m.tokens, 'registro', 'registros')} · ${contar(m.files, 'archivo distinto', 'archivos distintos')}`;

export const registro = (t) => `Registrada el ${fecha(t.at)} · ${t.checked ? 'firma revisada' : 'firma por revisar'}${t.requested ? ' · la de este enlace' : ''}`;

export const avance = (altura, alto) => `Comprobando en tu navegador: ${miles(altura)} de ${miles(alto)} registros.`;

/**
 * sello es lo primero que se lee: si lo que se ve está comprobado, si se está comprobando, si se perdió la conexión o
 * si algo no calza. Nada se presenta como comprobado si algo no calza (observador-web#c48fa397).
 */
export function sello({ problema, corte, desde, ahora, revision }) {
  if (problema) return { clase: 'error', titulo: 'Algo no calza', detalle: `Tu navegador encontró algo que no verifica, así que nada se muestra como comprobado. ${problema}` };
  if (corte) return { clase: 'aviso', titulo: 'Sin conexión con Mi Voto', detalle: `Reintentamos solos. Lo que ves es de las ${hora(desde)}.` };
  if (revision && !revision.completa) return { clase: '', titulo: 'Comprobando en tu navegador…', detalle: revision.texto };
  const detalle = [`Comprobado en tu navegador ${haceCuanto(ahora - desde)}.`, revision?.texto].filter(Boolean).join(' ');
  return { clase: 'ok', titulo: 'Todo calza', detalle };
}

const UNIDAD = { urfa: ['toque', 'toques'] };
const unidad = (vista) => UNIDAD[vista.mode] ?? ['voto', 'votos'];

/** cuantos dice una cantidad en la unidad de la votación: votos o, en un juego URFA, toques. */
export const cuantos = (vista, n) => contar(n, ...unidad(vista));

/** computo es la cabeza del resultado: final y contado en el navegador si cerró, en vivo si es un juego abierto. */
export function computo(vista) {
  if (vista.hidden || !vista.tally) return null;
  const total = vista.tally.reduce((a, b) => a + b, 0);
  const [uno, varios] = unidad(vista);
  if (!vista.closed) return { etiqueta: 'En vivo', contados: `${cuantos(vista, total)} hasta ahora.` };
  return { etiqueta: 'Resultado final', contados: `${contar(total, `${uno} contado`, `${varios} contados`)} en tu navegador.` };
}

export const porcentaje = (pct) => `${pct.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** colorDe da el color de una opción por su orden, nunca por lo que dice: marca, acento y luego gris. */
export const colorDe = (i) => ['marca', 'acento'][i] ?? 'neutro-opcion';

/** PANTALLA son los textos del modo pantalla grande, para proyectar el resultado en una sala. */
export const PANTALLA = {
  abrir: 'Ver en pantalla grande',
  cerrar: 'Salir de pantalla grande',
  aviso: 'Mi Voto · No es un registro oficial',
};
