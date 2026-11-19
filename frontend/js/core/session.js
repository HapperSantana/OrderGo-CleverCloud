// Manejo de la sesión en el navegador.
// Se conserva la estrategia original: el JWT vive en sessionStorage (se elimina al cerrar la pestaña)
// y nunca se muestra en pantalla ni se escribe en otro lugar.
const TOKEN_KEY = 'ordergo_token';
let currentUser = null;

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  currentUser = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* almacenamiento no disponible */ }
}

export function setUser(user) { currentUser = user; }
export function getUser() { return currentUser; }
export function isAdmin() { return currentUser?.rol === 'administrador'; }
