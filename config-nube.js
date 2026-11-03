/*
 * Cuentas en la nube (usuario y contraseña por persona).
 *
 * Mientras CONFIG_NUBE sea null, la app funciona SIN cuentas: los datos se quedan en cada dispositivo.
 * Para activar las cuentas, crea un proyecto de Firebase y pega aquí su configuración (ver docs/CUENTAS.md).
 * Estos datos NO son secretos: lo que protege la información son las reglas de firestore.rules.
 */
window.CONFIG_NUBE = null;

/* Ejemplo:
window.CONFIG_NUBE = {
  firebase: {
    apiKey: 'AIza…',
    authDomain: 'tu-proyecto.firebaseapp.com',
    projectId: 'tu-proyecto',
    appId: '1:…:web:…',
  },
  permitirRegistro: true,   // false: no se pueden crear cuentas nuevas desde la app
};
*/
