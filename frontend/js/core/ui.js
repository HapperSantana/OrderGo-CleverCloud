// Componentes de interfaz reutilizables: formato, badges, toasts, confirmaciones,
// estados de carga/vacío/error, paginación y un despachador de acciones por data-action.
const { Modal, Toast } = window.bootstrap;

/* ---------- Formato ---------- */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const moneyFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (value) => moneyFormat.format(Number(value || 0));
export const numberLabel = (value) => new Intl.NumberFormat('es-MX').format(Number(value || 0));

export function dateLabel(value, { withTime = true } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function avatar(name, extraClass = '') {
  return `<span class="avatar ${extraClass}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

/* ---------- Estados de pedido, roles y disponibilidad ---------- */
export const ORDER_STATES = {
  pendiente: { label: 'Pendiente', icon: 'bi-hourglass-split' },
  en_preparacion: { label: 'En preparación', icon: 'bi-fire' },
  listo: { label: 'Listo', icon: 'bi-bag-check' },
  entregado: { label: 'Entregado', icon: 'bi-check-circle-fill' },
  cancelado: { label: 'Cancelado', icon: 'bi-x-circle-fill' }
};
export const ORDER_FLOW = ['pendiente', 'en_preparacion', 'listo', 'entregado'];
export const isFinalState = (state) => state === 'entregado' || state === 'cancelado';

export function statusBadge(state) {
  const meta = ORDER_STATES[state] || { label: state, icon: 'bi-circle' };
  return `<span class="status-badge status-${escapeHtml(state)}"><i class="bi ${meta.icon}" aria-hidden="true"></i>${escapeHtml(meta.label)}</span>`;
}

export function roleBadge(role) {
  return role === 'administrador'
    ? '<span class="status-badge role-admin"><i class="bi bi-shield-lock-fill" aria-hidden="true"></i>Administrador</span>'
    : '<span class="status-badge role-empleado"><i class="bi bi-person-badge" aria-hidden="true"></i>Empleado</span>';
}

export function activeBadge(active, labels = ['Activo', 'Inactivo']) {
  return active
    ? `<span class="status-badge status-on"><i class="bi bi-check-circle-fill" aria-hidden="true"></i>${labels[0]}</span>`
    : `<span class="status-badge status-off"><i class="bi bi-slash-circle" aria-hidden="true"></i>${labels[1]}</span>`;
}

/* ---------- Toasts ---------- */
const TOAST_META = {
  success: { icon: 'bi-check-circle-fill', title: 'Listo' },
  error: { icon: 'bi-exclamation-octagon-fill', title: 'No se pudo completar' },
  warning: { icon: 'bi-exclamation-triangle-fill', title: 'Atención' },
  info: { icon: 'bi-info-circle-fill', title: 'Información' }
};

export function toast(message, type = 'success', title) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const meta = TOAST_META[type] || TOAST_META.info;
  const element = document.createElement('div');
  element.className = `og-toast is-${type} toast`;
  // Los errores se anuncian de inmediato; el resto de forma educada.
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.innerHTML = `
    <i class="bi ${meta.icon} toast-icon" aria-hidden="true"></i>
    <div><span class="toast-title">${escapeHtml(title || meta.title)}</span>${escapeHtml(message)}</div>
    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Cerrar notificación"></button>`;
  stack.appendChild(element);
  const instance = new Toast(element, { delay: type === 'error' ? 6500 : 4000 });
  element.addEventListener('hidden.bs.toast', () => element.remove());
  instance.show();
}

export const toastError = (error) => toast(error?.message || 'Ocurrió un error inesperado.', 'error');

/* ---------- Confirmación (reemplaza window.confirm) ---------- */
export function confirmDialog({ title, message, confirmText = 'Confirmar', variant = 'danger', icon = 'bi-exclamation-triangle' }) {
  const element = document.getElementById('confirmModal');
  const modal = Modal.getOrCreateInstance(element);
  element.querySelector('[data-confirm-title]').textContent = title;
  element.querySelector('[data-confirm-message]').textContent = message;
  const iconBox = element.querySelector('[data-confirm-icon]');
  iconBox.className = `confirm-icon tone-${variant === 'danger' ? 'danger' : 'orange'}`;
  iconBox.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
  const accept = element.querySelector('[data-confirm-accept]');
  accept.className = `btn btn-${variant === 'danger' ? 'danger' : 'primary'}`;
  accept.textContent = confirmText;

  return new Promise((resolve) => {
    let accepted = false;
    const onAccept = () => { accepted = true; modal.hide(); };
    accept.addEventListener('click', onAccept, { once: true });
    element.addEventListener('hidden.bs.modal', () => {
      accept.removeEventListener('click', onAccept);
      resolve(accepted);
    }, { once: true });
    modal.show();
  });
}

/* ---------- Estados de interfaz ---------- */
const STATE_PRESETS = {
  loading: { icon: '', title: 'Cargando información…', text: '' },
  empty: { icon: 'bi-inbox', title: 'Aún no hay registros', text: 'Cuando registres información aparecerá aquí.' },
  'no-results': { icon: 'bi-search', title: 'Sin resultados', text: 'No encontramos coincidencias. Prueba con otro término o quita los filtros.' },
  error: { icon: 'bi-wifi-off', title: 'No pudimos cargar la información', text: 'Revisa tu conexión e intenta de nuevo.' }
};

/** Devuelve el HTML de un bloque de estado. action = { label, name, icon } opcional. */
export function stateBlock(kind, { title, text, action } = {}) {
  const preset = STATE_PRESETS[kind] || STATE_PRESETS.empty;
  if (kind === 'loading') {
    return `<div class="state-block" role="status"><div class="spinner-border text-secondary mb-3" aria-hidden="true"></div><h4>${escapeHtml(title || preset.title)}</h4></div>`;
  }
  const button = action
    ? `<button type="button" class="btn ${kind === 'error' ? 'btn-light' : 'btn-primary'}" data-action="${escapeHtml(action.name)}"><i class="bi ${action.icon || 'bi-plus-lg'}" aria-hidden="true"></i>${escapeHtml(action.label)}</button>`
    : '';
  return `<div class="state-block ${kind === 'error' ? 'is-error' : ''}" ${kind === 'error' ? 'role="alert"' : ''}>
    <div class="state-icon"><i class="bi ${preset.icon}" aria-hidden="true"></i></div>
    <h4>${escapeHtml(title || preset.title)}</h4>
    <p>${escapeHtml(text ?? preset.text)}</p>${button}</div>`;
}

/** Filas "esqueleto" para tablas mientras se cargan los datos. */
export function skeletonRows(columns, rows = 5) {
  const cells = Array.from({ length: columns }, (_, i) => `<td><span class="skeleton" style="width:${50 + ((i * 17) % 40)}%"></span></td>`).join('');
  return Array.from({ length: rows }, () => `<tr aria-hidden="true">${cells}</tr>`).join('');
}

/* ---------- Paginación ---------- */
export function renderPagination(container, { page, limit, total, label = 'registros' }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (!total) { container.innerHTML = ''; return; }
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const windowPages = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p += 1) windowPages.push(p);
  const item = (target, content, { disabled = false, active = false, aria = '' } = {}) => `
    <li class="page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}">
      <button type="button" class="page-link" data-page="${target}" ${disabled ? 'disabled' : ''} ${active ? 'aria-current="page"' : ''} ${aria ? `aria-label="${aria}"` : ''}>${content}</button>
    </li>`;
  container.innerHTML = `
    <div class="pager">
      <span>Mostrando <strong>${from}–${to}</strong> de <strong>${numberLabel(total)}</strong> ${label}</span>
      ${pages > 1 ? `<nav aria-label="Paginación"><ul class="pagination pagination-sm">
        ${item(page - 1, '<i class="bi bi-chevron-left" aria-hidden="true"></i>', { disabled: page <= 1, aria: 'Página anterior' })}
        ${windowPages.map((p) => item(p, p, { active: p === page, aria: `Página ${p}` })).join('')}
        ${item(page + 1, '<i class="bi bi-chevron-right" aria-hidden="true"></i>', { disabled: page >= pages, aria: 'Página siguiente' })}
      </ul></nav>` : ''}
    </div>`;
}

/** Conecta los botones de paginación de un contenedor con un callback (page) => void. */
export function bindPagination(container, onChange) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    onChange(Number(button.dataset.page));
  });
}

/* ---------- Utilidades ---------- */
export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

/** Pone un botón en estado "procesando" (spinner + deshabilitado) y lo restaura. */
export function setBusy(button, busy, busyText = 'Guardando…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${escapeHtml(busyText)}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

export const modal = (id) => Modal.getOrCreateInstance(document.getElementById(id));

/* ---------- Acciones globales (delegación compatible con la CSP: sin onclick inline) ---------- */
const actions = new Map();
export function onAction(name, handler) { actions.set(name, handler); }
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.tagName === 'SELECT') return;
  const handler = actions.get(trigger.dataset.action);
  if (!handler) return;
  event.preventDefault();
  Promise.resolve(handler(trigger, event)).catch(toastError);
});

/* ---------- Eventos entre módulos ---------- */
export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(`og:${name}`, { detail }));
export const on = (name, handler) => document.addEventListener(`og:${name}`, (event) => handler(event.detail));
