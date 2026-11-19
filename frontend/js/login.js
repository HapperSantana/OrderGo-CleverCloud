const form = document.getElementById('loginForm');
const message = document.getElementById('loginMessage');
const button = document.getElementById('loginButton');

async function checkExistingSession() {
  const token = sessionStorage.getItem('ordergo_token');
  if (!token) return;
  try {
    const response = await fetch('/api/auth/perfil', { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) window.location.replace('/app.html');
    else sessionStorage.removeItem('ordergo_token');
  } catch (_) {
    // Si la API no responde, se permite intentar iniciar sesion nuevamente.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.textContent = 'Validando...';

  const correo = document.getElementById('correo').value.trim();
  const password = document.getElementById('password').value;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || 'No fue posible iniciar sesion.');

    // El token vive en sessionStorage y se elimina al cerrar la pestaña/sesion.
    // En produccion se recomienda evaluar cookie HttpOnly + Secure + SameSite y proteccion CSRF.
    sessionStorage.setItem('ordergo_token', data.token);
    window.location.replace('/app.html');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar al sistema';
  }
});

checkExistingSession();
