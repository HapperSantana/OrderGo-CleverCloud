// Pantalla de inicio de sesión. El JWT recibido se guarda en sessionStorage (estrategia existente).
import { api } from './core/api.js';
import { getToken, setToken, clearSession } from './core/session.js';
import { validateForm, liveValidation } from './core/validation.js';

const form = document.getElementById('loginForm');
const button = document.getElementById('loginButton');
const errorBox = document.getElementById('loginError');
const notice = document.getElementById('loginNotice');
const password = document.getElementById('password');
const toggle = document.getElementById('togglePassword');
const BUTTON_LABEL = button.innerHTML;

function showError(message) {
  errorBox.innerHTML = '<i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i><span></span>';
  errorBox.querySelector('span').textContent = message;
  errorBox.hidden = false;
}

function showNotice() {
  const params = new URLSearchParams(window.location.search);
  let text = '';
  if (params.has('expirada')) text = 'Tu sesión expiró o ya no es válida. Inicia sesión nuevamente.';
  else if (params.has('salida')) text = 'Cerraste sesión correctamente.';
  if (!text) return;
  notice.classList.toggle('alert-warning', params.has('expirada'));
  notice.classList.toggle('alert-success', !params.has('expirada'));
  notice.innerHTML = `<i class="bi ${params.has('expirada') ? 'bi-clock-history' : 'bi-check-circle-fill'}" aria-hidden="true"></i><span></span>`;
  notice.querySelector('span').textContent = text;
  notice.hidden = false;
  window.history.replaceState(null, '', '/login.html');
}

async function checkExistingSession() {
  if (!getToken()) return;
  try {
    await api('/api/auth/perfil', { redirectOn401: false });
    window.location.replace('/app.html');
  } catch (error) {
    if (error.status === 401) clearSession();
  }
}

toggle.addEventListener('click', () => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  toggle.setAttribute('aria-pressed', String(!visible));
  toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  toggle.innerHTML = `<i class="bi ${visible ? 'bi-eye' : 'bi-eye-slash'}" aria-hidden="true"></i>`;
});

liveValidation(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  notice.hidden = true;
  if (!validateForm(form)) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Verificando…</span>';
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { correo: document.getElementById('correo').value.trim(), password: password.value }
    });
    setToken(data.token);
    window.location.replace('/app.html');
  } catch (error) {
    // 401: el backend usa un mensaje genérico que no revela si la cuenta existe.
    showError(error.status === 401 ? 'Correo o contraseña incorrectos, o la cuenta está desactivada.' : error.message);
    password.select();
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = BUTTON_LABEL;
  }
});

showNotice();
checkExistingSession();
