// Punto de entrada del panel: protege la sesión, carga el perfil, aplica permisos por rol
// y enruta entre vistas mediante el hash (#/panel, #/pedidos, ...).
import { api } from './core/api.js';
import { getToken, clearSession, setUser, getUser, isAdmin } from './core/session.js';
import { escapeHtml, initials, roleBadge, toast, toastError, onAction, modal, dateLabel } from './core/ui.js';
import * as dashboard from './views/dashboard.js';
import * as orders from './views/orders.js';
import * as clients from './views/clients.js';
import * as products from './views/products.js';
import * as users from './views/users.js';

if (!getToken()) window.location.replace('/login.html');

const ROUTES = {
  panel: { title: 'Panel principal', view: dashboard },
  pedidos: { title: 'Pedidos', view: orders },
  clientes: { title: 'Clientes', view: clients },
  productos: { title: 'Productos', view: products },
  usuarios: { title: 'Usuarios', view: users, adminOnly: true }
};
const SIDEBAR_KEY = 'ordergo_sidebar_collapsed';
let currentRoute = null;

function parseRoute() {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES[name] ? name : 'panel';
}

function navigate() {
  const name = parseRoute();
  const route = ROUTES[name];

  // Control de permisos en la interfaz (el backend también responde 403).
  if (route.adminOnly && !isAdmin()) {
    toast('Esta sección es exclusiva para administradores.', 'warning', 'Acceso no autorizado');
    window.location.replace('#/panel');
    return;
  }

  document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== name; });
  document.querySelectorAll('[data-route]').forEach((link) => {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.getElementById('pageTitle').textContent = route.title;
  document.title = `${route.title} | OrderGo`;

  // Cierra el menú lateral en móvil después de navegar.
  const sidebar = document.getElementById('sidebar');
  window.bootstrap.Offcanvas.getInstance(sidebar)?.hide();

  if (currentRoute !== null && currentRoute !== name) document.getElementById('main').focus({ preventScroll: true });
  currentRoute = name;
  window.scrollTo({ top: 0 });
  Promise.resolve(route.view.show()).catch(toastError);
}

function renderUser(user) {
  const first = user.nombre.split(/\s+/)[0];
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.nombre; });
  document.querySelectorAll('[data-user-first-name]').forEach((el) => { el.textContent = first; });
  document.querySelectorAll('[data-user-role]').forEach((el) => { el.textContent = user.rol; });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials(user.nombre); });
  document.querySelectorAll('[data-user-role-badge]').forEach((el) => { el.innerHTML = roleBadge(user.rol); });
  document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = user.rol !== 'administrador'; });
}

function setupSidebarCollapse() {
  const button = document.getElementById('collapseSidebar');
  const apply = (collapsed) => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    button.setAttribute('aria-pressed', String(collapsed));
    button.setAttribute('aria-label', collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral');
  };
  let saved = false;
  try { saved = localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { /* sin almacenamiento */ }
  apply(saved);
  button.addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-collapsed');
    apply(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
  });
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST', redirectOn401: false }); } catch { /* se limpia la sesión de cualquier modo */ }
  clearSession();
  window.location.replace('/login.html?salida=1');
}

function openProfile() {
  const user = getUser();
  document.getElementById('profileBody').innerHTML = `
    <div class="d-flex align-items-center gap-3 mb-4">
      <span class="avatar avatar-accent" style="width:3.5rem;height:3.5rem;font-size:1.1rem" aria-hidden="true">${escapeHtml(initials(user.nombre))}</span>
      <div><strong class="d-block fs-5">${escapeHtml(user.nombre)}</strong>${roleBadge(user.rol)}</div>
    </div>
    <dl class="detail-grid mb-0">
      <div class="detail-item"><dt>Correo</dt><dd>${escapeHtml(user.correo)}</dd></div>
      <div class="detail-item"><dt>Permisos</dt><dd>${user.rol === 'administrador' ? 'Acceso completo, incluida la gestión de usuarios y del catálogo' : 'Pedidos, clientes y consulta del catálogo'}</dd></div>
    </dl>
    <p class="small text-muted mt-3 mb-0"><i class="bi bi-shield-lock" aria-hidden="true"></i> Por seguridad, la sesión se cierra automáticamente tras un periodo de inactividad o al cerrar la pestaña.</p>`;
  modal('profileModal').show();
}

async function init() {
  setupSidebarCollapse();
  onAction('logout', logout);
  onAction('open-profile', openProfile);

  try {
    const { usuario } = await api('/api/auth/perfil');
    setUser(usuario);
    renderUser(usuario);
  } catch (error) {
    if (error.status !== 401) {
      document.getElementById('bootScreen').innerHTML = `
        <div class="state-block is-error" role="alert"><div class="state-icon"><i class="bi bi-wifi-off" aria-hidden="true"></i></div>
        <h4>No pudimos iniciar el panel</h4><p>${escapeHtml(error.message)}</p>
        <a class="btn btn-primary" href="/app.html">Reintentar</a></div>`;
    }
    return;
  }

  document.getElementById('todayLabel').textContent = `Resumen de la operación · ${dateLabel(new Date(), { withTime: false })}`;
  [dashboard, orders, clients, products, users].forEach((view) => view.init());
  window.addEventListener('hashchange', navigate);
  navigate();
  const boot = document.getElementById('bootScreen');
  boot.classList.add('is-done');
  setTimeout(() => boot.remove(), 300);
}

init();
