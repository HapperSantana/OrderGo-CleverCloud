// Módulo de usuarios (exclusivo del administrador; el backend también lo restringe con requireRole).
import { api } from '../core/api.js';
import { isAdmin, getUser } from '../core/session.js';
import {
  escapeHtml, dateLabel, avatar, roleBadge, activeBadge, stateBlock, skeletonRows,
  renderPagination, bindPagination, setBusy, toast, toastError, confirmDialog, modal, onAction, emit, on
} from '../core/ui.js';
import { validateForm, clearValidation, liveValidation, setFieldError } from '../core/validation.js';

const listState = { page: 1, limit: 10 };
let listRequest = 0;
const cache = new Map();
let editing = null;

const isSelf = (user) => Number(user.id_usuario) === Number(getUser()?.id_usuario);

function renderRows(rows) {
  const tbody = document.getElementById('usersTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">${stateBlock('empty', { title: 'Sin usuarios', text: 'Registra a los empleados que usarán el sistema.', action: { name: 'new-user', label: 'Nuevo usuario', icon: 'bi-person-plus' } })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((u) => `
    <tr class="${u.activo ? '' : 'text-muted'}">
      <td><div class="cell-person">${avatar(u.nombre, u.rol === 'administrador' ? '' : 'avatar-accent')}
        <div><span class="cell-main">${escapeHtml(u.nombre)}${isSelf(u) ? ' <span class="badge text-bg-light border">Tú</span>' : ''}</span>
        <span class="cell-sub">${escapeHtml(u.correo)}</span></div></div></td>
      <td>${roleBadge(u.rol)}</td>
      <td>${activeBadge(u.activo)}</td>
      <td class="d-none d-md-table-cell text-nowrap">${dateLabel(u.fecha_creacion, { withTime: false })}</td>
      <td><div class="row-actions">
        <button type="button" class="btn btn-sm btn-light" data-action="edit-user" data-id="${u.id_usuario}"><i class="bi bi-pencil" aria-hidden="true"></i><span class="d-none d-sm-inline">Editar</span><span class="visually-hidden"> a ${escapeHtml(u.nombre)}</span></button>
        ${isSelf(u) ? '' : `<button type="button" class="btn btn-sm ${u.activo ? 'btn-outline-danger' : 'btn-success'}" data-action="toggle-user" data-id="${u.id_usuario}">
          <i class="bi ${u.activo ? 'bi-person-slash' : 'bi-person-check'}" aria-hidden="true"></i><span class="d-none d-sm-inline">${u.activo ? 'Desactivar' : 'Activar'}</span><span class="visually-hidden"> a ${escapeHtml(u.nombre)}</span></button>`}
      </div></td>
    </tr>`).join('');
}

async function loadList() {
  if (!isAdmin()) return;
  const requestId = ++listRequest;
  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = skeletonRows(5, 4);
  tbody.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/usuarios', { query: listState });
    if (requestId !== listRequest) return;
    data.datos.forEach((u) => cache.set(u.id_usuario, u));
    renderRows(data.datos);
    renderPagination(document.getElementById('usersPager'), { ...data.paginacion, label: 'usuarios' });
  } catch (error) {
    if (requestId !== listRequest) return;
    tbody.innerHTML = `<tr><td colspan="5">${stateBlock('error', { text: error.message, action: { name: 'reload-users', label: 'Reintentar', icon: 'bi-arrow-clockwise' } })}</td></tr>`;
    document.getElementById('usersPager').innerHTML = '';
  } finally {
    tbody.removeAttribute('aria-busy');
  }
}

function openForm(user = null) {
  const form = document.getElementById('userForm');
  form.reset();
  clearValidation(form);
  editing = user;
  const password = document.getElementById('userPassword');
  const role = document.getElementById('userRole');
  document.getElementById('userModalTitle').textContent = user ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('userSubmit').innerHTML = `<i class="bi bi-check-lg" aria-hidden="true"></i>${user ? 'Guardar cambios' : 'Crear usuario'}`;
  password.required = !user;
  document.getElementById('userPasswordLabel').innerHTML = user
    ? 'Nueva contraseña <span class="text-muted fw-normal">(opcional)</span>'
    : 'Contraseña temporal<span class="required-mark" aria-hidden="true">*</span>';
  document.getElementById('userPasswordHelp').textContent = user
    ? 'Déjala vacía para conservar la contraseña actual. Si la cambias, debe tener al menos 10 caracteres.'
    : 'Mínimo 10 caracteres. Compártela de forma segura con la persona.';
  // Un administrador no puede quitarse su propio rol (regla del backend).
  role.disabled = Boolean(user && isSelf(user));
  if (user) {
    document.getElementById('userName').value = user.nombre;
    document.getElementById('userEmail').value = user.correo;
    role.value = user.rol;
  }
  modal('userModal').show();
}

async function submitUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateForm(form)) return;
  const password = document.getElementById('userPassword').value;
  const body = {
    nombre: document.getElementById('userName').value.trim(),
    correo: document.getElementById('userEmail').value.trim(),
    rol: document.getElementById('userRole').value
  };
  if (password) body.password = password;

  const button = document.getElementById('userSubmit');
  setBusy(button, true);
  try {
    if (editing) {
      await api(`/api/usuarios/${editing.id_usuario}`, { method: 'PUT', body });
      toast(`Se actualizaron los datos de ${body.nombre}.`, 'success', 'Usuario actualizado');
    } else {
      await api('/api/usuarios', { method: 'POST', body });
      toast(`${body.nombre} ya puede iniciar sesión.`, 'success', 'Usuario creado');
    }
    modal('userModal').hide();
    emit('users-changed');
  } catch (error) {
    if (error.status === 409) setFieldError(document.getElementById('userEmail'), 'Ya existe una cuenta con este correo.');
    toastError(error.status === 409 ? new Error('Ya existe una cuenta registrada con ese correo.') : error);
  } finally {
    setBusy(button, false);
  }
}

async function toggleUser(id) {
  const user = cache.get(id);
  if (!user) return;
  const activate = !user.activo;
  const ok = await confirmDialog({
    title: activate ? '¿Activar cuenta?' : '¿Desactivar cuenta?',
    message: activate
      ? `${user.nombre} podrá volver a iniciar sesión.`
      : `${user.nombre} perderá el acceso de inmediato, incluso si tiene una sesión abierta. Su historial de pedidos se conserva.`,
    confirmText: activate ? 'Activar' : 'Desactivar',
    variant: activate ? 'primary' : 'danger',
    icon: activate ? 'bi-person-check' : 'bi-person-slash'
  });
  if (!ok) return;
  await api(`/api/usuarios/${id}/estado`, { method: 'PATCH', body: { activo: activate } });
  toast(`La cuenta de ${user.nombre} fue ${activate ? 'activada' : 'desactivada'}.`, 'success', 'Estado actualizado');
  emit('users-changed');
}

export function init() {
  const form = document.getElementById('userForm');
  liveValidation(form);
  form.addEventListener('submit', submitUser);
  bindPagination(document.getElementById('usersPager'), (page) => { listState.page = page; loadList(); });
  onAction('new-user', () => openForm());
  onAction('reload-users', loadList);
  onAction('edit-user', (el) => openForm(cache.get(Number(el.dataset.id))));
  onAction('toggle-user', (el) => toggleUser(Number(el.dataset.id)));
  on('users-changed', loadList);
}

export const show = loadList;
