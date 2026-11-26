// Modo de color del observador. Es lo único que la página guarda en el navegador: la palabra «claro» u «oscuro», bajo
// una sola clave. Sin elegir, o con «Como el sistema», sigue al sistema. Si el navegador no deja guardar, el modo
// elegido dura mientras la página está abierta.
export const CLAVE = 'modo-color';
const TEMA = { claro: 'light', oscuro: 'dark' };

/** almacenDelNavegador da el almacenamiento local, o null si el navegador no lo permite. */
export function almacenDelNavegador() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** leerModo da «claro», «oscuro» o «sistema». */
export function leerModo(almacen) {
  try {
    const modo = almacen?.getItem(CLAVE);
    return TEMA[modo] ? modo : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** guardarModo recuerda «claro» u «oscuro»; cualquier otra cosa borra la elección. */
export function guardarModo(almacen, modo) {
  try {
    if (!TEMA[modo]) {
      almacen?.removeItem(CLAVE);
      return;
    }
    almacen?.setItem(CLAVE, modo);
  } catch {
    // El navegador no deja guardar: el modo dura mientras la página está abierta.
  }
}

/** aplicarModo fija el tema de la página; con «sistema» lo deja seguir al sistema. */
export function aplicarModo(raiz, modo) {
  if (!TEMA[modo]) {
    delete raiz.dataset.theme;
    return;
  }
  raiz.dataset.theme = TEMA[modo];
}
