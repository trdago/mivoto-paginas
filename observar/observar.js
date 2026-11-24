// Interfaz del observador: dibuja lo que verifica el Web Worker (trabajador.js).
// Todo texto que viene de la cadena (título, opciones) entra con textContent, nunca como HTML.
import { eleccionDe, estadoDe, filasResultado, participacion } from './nucleo.js';

const $ = (id) => document.getElementById(id);
const meta = (nombre) => document.querySelector(`meta[name="${nombre}"]`).content;
const corto = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const hora = (ms) => new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const MODOS = { secreto: 'Votación secreta', urfa: 'URFA' };

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
      c.append(el('b', '', p.valor.toLocaleString('es-CL')), el('span', 'suave', p.etiqueta));
      return c;
    }),
  );
}

function dibujarResultado(vista) {
  const filas = filasResultado(vista);
  $('resultado-oculto').hidden = !vista.hidden;
  $('resultado').replaceChildren(
    ...filas.map((f) => {
      const o = el('div', f.gana ? 'opcion gana' : 'opcion');
      const fila = el('div', 'fila');
      fila.append(el('span', '', f.gana ? `${f.opcion} · gana` : f.opcion), el('span', 'suave', `${f.votos} · ${f.pct}%`));
      const barra = el('div', 'barra');
      const relleno = el('i');
      relleno.style.width = `${f.pct}%`;
      barra.append(relleno);
      o.append(fila, barra);
      return o;
    }),
  );
}

function dibujarFeed(o, nuevas) {
  $('feed').replaceChildren(
    ...o.feed.map((f) => {
      const li = el('li', ['bloque', f.propias ? 'propio' : '', nuevas.has(f.altura) ? 'nuevo' : ''].join(' ').trim());
      const fila = el('div', 'fila');
      fila.append(el('strong', '', `Bloque ${f.altura.toLocaleString('es-CL')}`), el('span', 'mono suave', corto(f.hash)));
      const datos = el('div', 'suave', `${hora(f.hora)} · ${f.txs} tx · firmado ${f.firmas}/2`);
      li.append(fila, datos);
      if (f.propias) li.append(el('div', '', `De esta votación: ${f.detalle}`));
      return li;
    }),
  );
}

function dibujar(o, nuevas = new Set()) {
  const v = o.vista;
  if (!v) return fallar('Esta votación no está en la cadena. Revisa que el enlace esté completo.');
  $('carga').hidden = true;
  $('contenido').hidden = false;
  document.title = `${v.title} · Observar · Mi Voto`;
  $('titulo').textContent = v.title;
  $('modo').textContent = MODOS[v.mode] ?? v.mode;
  $('estado').textContent = estadoDe(v, Date.now()).texto;
  dibujarCifras(v);
  dibujarResultado(v);
  $('verif-titulo').textContent = v.invariants
    ? `La verificación encontró un problema: ${v.invariants}`
    : `${o.altura.toLocaleString('es-CL')} bloques verificados en tu navegador`;
  $('verif-titulo').className = v.invariants ? 'error' : '';
  $('verif-detalle').textContent = `Firmas de los 2 validadores (${o.validadores.map(corto).join(' · ')}), cada transacción y el recuento propio.`;
  const s = o.nodoEstado;
  $('nodo').textContent = `Nodo: bloque ${s.height.toLocaleString('es-CL')} · ${s.peer_healthy ? 'los 2 validadores en línea' : 'esperando al segundo validador'} · confirma en ~${Math.round(s.p95_finality_ms)} ms`;
  $('nodo-distinto').hidden = !o.nodoDistinto;
  dibujarFeed(o, nuevas);
}

let ultima = null;

/** Qué hace la página con cada aviso del trabajador. */
const AVISOS = {
  avance({ altura, alto }) {
    $('carga-texto').textContent = `Bloque ${altura.toLocaleString('es-CL')} de ${alto.toLocaleString('es-CL')}: firmas, transacciones y reglas.`;
    $('carga-barra').value = altura / Math.max(alto, 1);
  },
  vista({ foto }) {
    const antes = new Set((ultima ?? foto).feed.map((f) => f.altura));
    ultima = foto;
    $('latido').textContent = 'en vivo';
    dibujar(foto, new Set(foto.feed.map((f) => f.altura).filter((h) => !antes.has(h))));
  },
  corte({ texto }) {
    $('latido').textContent = `sin conexión con el nodo; reintento… (${texto})`;
  },
  falla({ texto }) {
    fallar(texto);
  },
};

/** seguir verifica en un Web Worker: la página solo dibuja y no se congela (FND-010). */
function seguir(eleccion) {
  const trabajador = new Worker(new URL('trabajador.js', import.meta.url), { type: 'module' });
  trabajador.onmessage = ({ data }) => AVISOS[data.tipo](data);
  trabajador.onerror = () => fallar('Este navegador no pudo cargar el verificador. Actualízalo o prueba con otro.');
  const datos = { nodo: meta('mivoto-nodo'), validadores: meta('mivoto-validadores').split(','), eleccion };
  trabajador.postMessage({ tipo: 'seguir', datos, visible: !document.hidden });
  document.addEventListener('visibilitychange', () => {
    trabajador.postMessage({ tipo: 'visible', visible: !document.hidden });
  });
}

function main() {
  const eleccion = eleccionDe(location.hash);
  if (!eleccion) return fallar('Falta la votación en el enlace. Pide el enlace de observador a quien organiza la votación.');
  seguir(eleccion);
  setInterval(() => {
    if (ultima?.vista) $('estado').textContent = estadoDe(ultima.vista, Date.now()).texto;
  }, 1000);
}

window.addEventListener('hashchange', () => location.reload());
main();
