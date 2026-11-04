/*
 * Cuentas en la nube (correo y contraseña por persona): proyecto de Firebase «facturacion».
 *
 * Con CONFIG_NUBE = null, la app funciona SIN cuentas (los datos se quedan en cada dispositivo).
 * Estos datos NO son secretos (van en cualquier app web de Firebase): lo que protege la información son las
 * reglas de firestore.rules y las contraseñas. Ver docs/CUENTAS.md.
 */
window.CONFIG_NUBE = {
  firebase: {
    apiKey: 'AIzaSyBWsns3aOokhD_GfXefwrWqCISAlhTSFwg',
    authDomain: 'facturacion-536fc.firebaseapp.com',
    projectId: 'facturacion-536fc',
    storageBucket: 'facturacion-536fc.firebasestorage.app',
    messagingSenderId: '983150088611',
    appId: '1:983150088611:web:5573d02983b5ff3263ca16',
  },
  permitirRegistro: true,   // false: quita «Crear cuenta» (cerrar también el registro en Firebase, ver docs/CUENTAS.md)
};
