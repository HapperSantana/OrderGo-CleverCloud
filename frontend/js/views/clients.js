// Módulo de clientes: directorio con búsqueda y paginación, registro, edición y eliminación (admin).
import { api } from '../core/api.js';
import { isAdmin } from '../core/session.js';
import {
  escapeHtml, dateLabel, avatar, stateBlock, skeletonRows, renderPagination, bindPagination,
  debounce, setBusy, toast, toastError, confirmDialog, modal, onAction, emit, on
} from '../core/ui.js';
import { validateForm, clearValidation, liveValidation } from '../core/validation.js';

const listState = { page: 1, limit: 10, q: '' };
let listRequest = 0;
const cache = new Map();
let formContext = { id: null, onDone: null, savedId: null };

function renderRows(rows) {
  const tbody = document.getElementById('clientsTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6">${listState.q
      ? stateBlock('no-results', { text: `No hay clientes que coincidan con “${listState.q}”.` })
      : stateBlock('empty', { title: 'Aún no hay clientes', text: 'Registra a tus clientes para asignarles pedidos.', action: { name: 'new-client', label: 'Nuevo cliente', icon: 'bi-person-plus' } })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((c) => `
    <tr>
      <td><div class="cell-person">${avatar(c.nombre)}<div><span class="cell-main">${escapeHtml(c.nombre)}</span>
        ${c.correo ? `<span class="cell-sub d-md-none">${escapeHtml(c.correo)}</span>` : ''}</div></div></td>
      <td class="text-nowrap"><a class="contact-link" href="tel:${escapeHtml(c.telefono)}"><i class="bi bi-telephone" aria-hidden="true"></i>${escapeHtml(c.telefono)}</a></td>
      <td class="d-none d-md-table-cell">${c.correo ? `<a class="contact-link" href="mailto:${escapeHtml(c.correo)}">${escapeHtml(c.correo)}</a>` : '<span class="text-muted">—</span>'}</td>
      <td class="d-none d-xl-table-cell text-muted">${escapeHtml(c.direccion || '—')}</td>
      <td class="d-none d-lg-table-cell text-muted text-nowrap">${dateLabel(c.fecha_creacion, { withTime: false })}</td>
      <td><div class="row-actions">
        <button type="button" class="btn btn-sm btn-light" data-action="edit-client" data-id="${c.id_cliente}"><i class="bi bi-pencil" aria-hidden="true"></i><span class="d-none d-sm-inline">Editar</span><span class="visually-hidden"> a ${escapeHtml(c.nombre)}</span></button>
        ${isAdmin() ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-client" data-id="${c.id_cliente}" aria-label="Eliminar a ${escapeHtml(c.nombre)}"><i class="bi bi-trash" aria-hidden="true"></i></button>` : ''}
      </div></td>
    </tr>`).join('');
}

async function loadList() {
  const requestId = ++listRequest;
  const tbody = document.getElementById('clientsTbody');
  tbody.innerHTML = skeletonRows(6, 6);
  tbody.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/clientes', { query: listState });
    if (requestId !== listRequest) return;
    if (!data.datos.length && listState.page > 1 && data.paginacion.total) {
      listState.page = Math.ceil(data.paginacion.total / listState.limit);
      return loadList();
    }
    data.datos.forEach((c) => cache.set(c.id_cliente, c));
    renderRows(data.datos);
    renderPagination(document.getElementById('clientsPager'), { ...data.paginacion, label: 'clientes' });
  } catch (error) {
    if (requestId !== listRequest) return;
    tbody.innerHTML = `<tr><td colspan="6">${stateBlock('error', { text: error.message, action: { name: 'reload-clients', label: 'Reintentar', icon: 'bi-arrow-clockwise' } })}</td></tr>`;
    document.getElementById('clientsPager').innerHTML = '';
  } finally {
    tbody.removeAttribute('aria-busy');
  }
}

/**
 * Abre el formulario de cliente. client = null para registrar.
 * onDone(idGuardado | null) se ejecuta cuando el modal termina de cerrarse.
 */
export function openClientForm(client = null, { onDone = null } = {}) {
  const form = document.getElementById('clientForm');
  form.reset();
  clearValidation(form);
  formContext = { id: client?.id_cliente ?? null, onDone, savedId: null };
  document.getElementById('clientModalTitle').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('clientSubmit').innerHTML = `<i class="bi bi-check-lg" aria-hidden="true"></i>${client ? 'Guardar cambios' : 'Registrar cliente'}`;
  if (client) {
    document.getElementById('clientName').value = client.nombre;
    document.getElementById('clientPhone').value = client.telefono;
    document.getElementById('clientEmail').value = client.correo || '';
    document.getElementById('clientAddress').value = client.direccion || '';
  }
  modal('clientModal').show();
}

async function submitClient(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateForm(form)) return;
  const body = {
    nombre: document.getElementById('clientName').value.trim(),
    telefono: document.getElementById('clientPhone').value.trim(),
    correo: document.getElementById('clientEmail').value.trim() || null,
    direccion: document.getElementById('clientAddress').value.trim() || null
  };
  const button = document.getElementById('clientSubmit');
  setBusy(button, true);
  try {
    if (formContext.id) {
      await api(`/api/clientes/${formContext.id}`, { method: 'PUT', body });
      formContext.savedId = formContext.id;
      toast(`Se actualizaron los datos de ${body.nombre}.`, 'success', 'Cliente actualizado');
    } else {
      const data = await api('/api/clientes', { method: 'POST', body });
      formContext.savedId = data.id_cliente;
      toast(`${body.nombre} ya puede recibir pedidos.`, 'success', 'Cliente registrado');
    }
    modal('clientModal').hide();
    emit('clients-changed');
  } catch (error) {
    toastError(error);
  } finally {
    setBusy(button, false);
  }
}

async function editClient(id) {
  let client = cache.get(id);
  if (!client) client = (await api(`/api/clientes/${id}`)).cliente;
  openClientForm(client);
}

async function deleteClient(id) {
  const client = cache.get(id);
  const ok = await confirmDialog({
    title: '¿Eliminar cliente?',
    message: `Se eliminará a ${client?.nombre || 'este cliente'}. Si tiene pedidos registrados no podrá eliminarse para conservar el historial.`,
    confirmText: 'Eliminar cliente',
    icon: 'bi-trash'
  });
  if (!ok) return;
  try {
    await api(`/api/clientes/${id}`, { method: 'DELETE' });
    toast('El cliente fue eliminado.', 'success', 'Cliente eliminado');
    emit('clients-changed');
  } catch (error) {
    if (error.status === 409) toast('Este cliente tiene pedidos registrados, por lo que se conserva para mantener el historial.', 'warning', 'No se puede eliminar');
    else throw error;
  }
}

export function init() {
  const form = document.getElementById('clientForm');
  liveValidation(form);
  form.addEventListener('submit', submitClient);
  document.getElementById('clientModal').addEventListener('hidden.bs.modal', () => {
    const { onDone, savedId } = formContext;
    formContext = { id: null, onDone: null, savedId: null };
    onDone?.(savedId);
  });

  document.getElementById('clientSearch').addEventListener('input', debounce((event) => {
    listState.q = event.target.value.trim();
    listState.page = 1;
    loadList();
  }, 300));
  bindPagination(document.getElementById('clientsPager'), (page) => { listState.page = page; loadList(); });

  onAction('new-client', () => openClientForm());
  onAction('reload-clients', loadList);
  onAction('edit-client', (el) => editClient(Number(el.dataset.id)));
  onAction('delete-client', (el) => deleteClient(Number(el.dataset.id)));
  on('clients-changed', () => { if (!document.querySelector('[data-view="clientes"]').hidden) loadList(); });
}

export const show = loadList;
