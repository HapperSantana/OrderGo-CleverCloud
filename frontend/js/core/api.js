// Cliente HTTP único para la API REST de OrderGo.
// Todas las solicitudes protegidas envían "Authorization: Bearer <JWT>" y los errores
// se normalizan en ApiError con un mensaje comprensible para el usuario.
import { getToken, clearSession } from './session.js';

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const STATUS_MESSAGES = {
  400: 'La información enviada no es válida. Revisa los campos.',
  401: 'Tu sesión expiró. Inicia sesión nuevamente.',
  403: 'Acceso no autorizado: no tienes permisos para realizar esta operación.',
  404: 'El registro solicitado no existe o fue eliminado.',
  409: 'No se pudo completar la operación porque el registro está relacionado con otros datos o ya existe.',
  413: 'La información enviada es demasiado grande.',
  429: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  500: 'Ocurrió un error en el servidor. Intenta nuevamente en unos momentos.'
};
const NETWORK_MESSAGE = 'No hay conexión con el servidor. Verifica tu conexión a internet e intenta de nuevo.';

function buildUrl(path, query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * @param {string} path      Ruta de la API, p. ej. "/api/clientes".
 * @param {object} options   { method, body, query, auth = true, redirectOn401 = true }
 */
export async function api(path, { method = 'GET', body, query, auth = true, redirectOn401 = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0);
  }

  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));

  if (response.status === 401 && auth && redirectOn401) {
    clearSession();
    window.location.replace('/login.html?expirada=1');
    throw new ApiError(STATUS_MESSAGES[401], 401, data);
  }

  if (!response.ok) {
    // Los errores 5xx nunca muestran detalles internos; los 4xx usan el mensaje de la API.
    const message = response.status >= 500
      ? STATUS_MESSAGES[500]
      : data.mensaje || STATUS_MESSAGES[response.status] || `No se pudo completar la solicitud (HTTP ${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data;
}
