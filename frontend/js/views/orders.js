// Módulo de pedidos: listado con búsqueda/filtros/orden/paginación, registro con carrito,
// detalle y cambio de estado. El total definitivo siempre lo calcula el backend con los precios de MySQL.
import { api } from '../core/api.js';
import { isAdmin } from '../core/session.js';
import {
  escapeHtml, money, dateLabel, statusBadge, stateBlock, skeletonRows, renderPagination, bindPagination,
  debounce, setBusy, toast, toastError, confirmDialog, modal, onAction, emit, on, numberLabel,
  ORDER_STATES, ORDER_FLOW, isFinalState
} from '../core/ui.js';
import { openClientForm } from './clients.js';

const MAX_LINES = 30;
const MAX_QTY = 100;
const listState = { page: 1, limit: 10, estado: '', q: '', orden: 'desc' };
let counts = null;
let listRequest = 0;

/* =========================================================================
   Listado
   ========================================================================= */
function renderChips() {
  const chips = [{ value: '', label: 'Todos', count: counts?.total }]
    .concat(Object.entries(ORDER_STATES).map(([value, meta]) => ({ value, label: meta.label, icon: meta.icon, count: counts?.[value] })));
  document.getElementById('orderChips').innerHTML = chips.map((chip) => `
    <button type="button" class="chip" data-state-filter="${chip.value}" aria-pressed="${chip.value === listState.estado}">
      ${chip.icon ? `<i class="bi ${chip.icon}" aria-hidden="true"></i>` : ''}${chip.label}
      ${chip.count !== undefined ? `<span class="chip-count">${numberLabel(chip.count)}</span>` : ''}
    </button>`).join('');
}

function stateMenu(order) {
  const items = [];
  if (!isFinalState(order.estado)) {
    for (const [value, meta] of Object.entries(ORDER_STATES)) {
      if (value === order.estado || value === 'pendiente') continue;
      items.push(`<li><button class="dropdown-item ${value === 'cancelado' ? 'text-danger' : ''}" type="button" data-action="set-order-state" data-id="${order.id_pedido}" data-state="${value}"><i class="bi ${meta.icon}" aria-hidden="true"></i>Marcar como ${meta.label.toLowerCase()}</button></li>`);
    }
  }
  if (isAdmin()) {
    if (items.length) items.push('<li><hr class="dropdown-divider"></li>');
    items.push(`<li><button class="dropdown-item text-danger" type="button" data-action="delete-order" data-id="${order.id_pedido}"><i class="bi bi-trash" aria-hidden="true"></i>Eliminar pedido</button></li>`);
  }
  if (!items.length) return '';
  return `<div class="dropdown">
    <button class="btn btn-sm btn-light" type="button" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" aria-label="Más acciones para el pedido ${order.id_pedido}"><i class="bi bi-three-dots-vertical" aria-hidden="true"></i></button>
    <ul class="dropdown-menu dropdown-menu-end">${items.join('')}</ul></div>`;
}

function renderRows(rows) {
  const tbody = document.getElementById('ordersTbody');
  if (!rows.length) {
    const filtered = listState.q || listState.estado;
    tbody.innerHTML = `<tr><td colspan="7">${filtered
      ? stateBlock('no-results', { text: 'No hay pedidos que coincidan con la búsqueda o el filtro seleccionado.' })
      : stateBlock('empty', { title: 'Aún no hay pedidos', text: 'Registra el primer pedido para comenzar.', action: { name: 'new-order', label: 'Nuevo pedido' } })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((order) => `
    <tr>
      <td><span class="order-id">#${order.id_pedido}</span></td>
      <td><span class="cell-main">${escapeHtml(order.cliente)}</span><span class="cell-sub d-md-none">${dateLabel(order.fecha)}</span></td>
      <td class="d-none d-md-table-cell text-muted text-nowrap">${dateLabel(order.fecha)}</td>
      <td class="text-end fw-semibold tabular text-nowrap">${money(order.total)}</td>
      <td>${statusBadge(order.estado)}</td>
      <td class="d-none d-lg-table-cell text-muted">${escapeHtml(order.registrado_por)}</td>
      <td><div class="row-actions">
        <button type="button" class="btn btn-sm btn-light" data-action="view-order" data-id="${order.id_pedido}"><i class="bi bi-eye" aria-hidden="true"></i><span class="d-none d-sm-inline">Ver</span><span class="visually-hidden"> pedido ${order.id_pedido}</span></button>
        ${stateMenu(order)}
      </div></td>
    </tr>`).join('');
}

async function loadCounts() {
  try {
    const { resumen } = await api('/api/pedidos/resumen');
    counts = resumen.pedidos;
  } catch { counts = null; }
  renderChips();
}

async function loadList() {
  const requestId = ++listRequest;
  const tbody = document.getElementById('ordersTbody');
  tbody.innerHTML = skeletonRows(7, 6);
  tbody.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/pedidos', { query: { ...listState } });
    if (requestId !== listRequest) return; // se descarta una respuesta obsoleta
    // Si la página quedó vacía (p. ej. tras eliminar), se regresa a la anterior.
    if (!data.datos.length && listState.page > 1 && data.paginacion.total) {
      listState.page = Math.ceil(data.paginacion.total / listState.limit);
      return loadList();
    }
    renderRows(data.datos);
    renderPagination(document.getElementById('ordersPager'), { ...data.paginacion, label: 'pedidos' });
  } catch (error) {
    if (requestId !== listRequest) return;
    tbody.innerHTML = `<tr><td colspan="7">${stateBlock('error', { text: error.message, action: { name: 'reload-orders', label: 'Reintentar', icon: 'bi-arrow-clockwise' } })}</td></tr>`;
    document.getElementById('ordersPager').innerHTML = '';
  } finally {
    tbody.removeAttribute('aria-busy');
  }
}

function refresh() {
  loadCounts();
  return loadList();
}

/* =========================================================================
   Cambio de estado y eliminación
   ========================================================================= */
async function changeState(id, estado) {
  if (estado === 'cancelado') {
    const ok = await confirmDialog({
      title: `¿Cancelar el pedido #${id}?`,
      message: 'El pedido quedará como cancelado y ya no podrá avanzar a otro estado desde la interfaz.',
      confirmText: 'Sí, cancelar pedido'
    });
    if (!ok) return false;
  }
  await api(`/api/pedidos/${id}/estado`, { method: 'PATCH', body: { estado } });
  toast(`El pedido #${id} ahora está "${ORDER_STATES[estado].label}".`, 'success', 'Estado actualizado');
  emit('orders-changed');
  return true;
}

async function deleteOrder(id) {
  const ok = await confirmDialog({
    title: `¿Eliminar el pedido #${id}?`,
    message: 'Se eliminarán el pedido y sus productos. Esta acción no se puede deshacer.',
    confirmText: 'Eliminar pedido',
    icon: 'bi-trash'
  });
  if (!ok) return false;
  await api(`/api/pedidos/${id}`, { method: 'DELETE' });
  toast(`El pedido #${id} fue eliminado.`, 'success', 'Pedido eliminado');
  emit('orders-changed');
  return true;
}

/* =========================================================================
   Detalle
   ========================================================================= */
function stateSteps(state) {
  if (state === 'cancelado') {
    return '<div class="alert alert-danger d-flex align-items-center gap-2 py-2 small"><i class="bi bi-x-circle-fill" aria-hidden="true"></i>Este pedido fue cancelado.</div>';
  }
  const index = ORDER_FLOW.indexOf(state);
  return `<ol class="state-steps" aria-label="Progreso del pedido">
    ${ORDER_FLOW.map((s, i) => `<li class="${i < index || state === 'entregado' ? 'done' : ''} ${i === index && state !== 'entregado' ? 'current' : ''}" ${i === index ? 'aria-current="step"' : ''}>${ORDER_STATES[s].label}</li>`).join('')}
  </ol>`;
}

async function openDetail(id) {
  const body = document.getElementById('orderDetailBody');
  const footer = document.getElementById('orderDetailFooter');
  document.getElementById('orderDetailTitle').textContent = `Pedido #${id}`;
  body.innerHTML = stateBlock('loading', { title: 'Cargando detalle…' });
  footer.innerHTML = '<button type="button" class="btn btn-light ms-auto" data-bs-dismiss="modal">Cerrar</button>';
  modal('orderDetailModal').show();

  let data;
  try {
    data = await api(`/api/pedidos/${id}`);
  } catch (error) {
    body.innerHTML = stateBlock('error', { title: 'No se pudo cargar el pedido', text: error.message });
    return;
  }
  const { pedido, productos } = data;
  body.innerHTML = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      ${statusBadge(pedido.estado)}
      <span class="text-muted small"><i class="bi bi-calendar3" aria-hidden="true"></i> ${dateLabel(pedido.fecha)}</span>
    </div>
    ${stateSteps(pedido.estado)}
    <dl class="detail-grid">
      <div class="detail-item"><dt>Cliente</dt><dd>${escapeHtml(pedido.cliente)}</dd></div>
      <div class="detail-item"><dt>Teléfono</dt><dd>${pedido.telefono ? `<a class="contact-link" href="tel:${escapeHtml(pedido.telefono)}"><i class="bi bi-telephone" aria-hidden="true"></i>${escapeHtml(pedido.telefono)}</a>` : '—'}</dd></div>
      <div class="detail-item"><dt>Registrado por</dt><dd>${escapeHtml(pedido.registrado_por)}</dd></div>
    </dl>
    <div class="og-card mb-3">
      <div class="table-wrap">
        <table class="table align-middle">
          <caption class="visually-hidden">Productos del pedido ${pedido.id_pedido}</caption>
          <thead><tr><th scope="col">Producto</th><th scope="col" class="text-end">Cant.</th><th scope="col" class="text-end">Precio unit.</th><th scope="col" class="text-end">Subtotal</th></tr></thead>
          <tbody>${productos.map((item) => `
            <tr><td class="cell-main">${escapeHtml(item.producto)}</td><td class="text-end tabular">${item.cantidad}</td>
            <td class="text-end tabular text-nowrap">${money(item.precio_unitario)}</td><td class="text-end tabular fw-semibold text-nowrap">${money(item.subtotal)}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th scope="row" colspan="3" class="text-end">Total</th><td class="text-end fs-5 fw-bold tabular text-nowrap">${money(pedido.total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
    <h3 class="h6 fw-bold">Observaciones</h3>
    ${pedido.observaciones ? `<div class="notes-box"><i class="bi bi-chat-left-text me-1" aria-hidden="true"></i>${escapeHtml(pedido.observaciones)}</div>` : '<p class="text-muted small mb-0">Sin observaciones.</p>'}`;

  const options = Object.entries(ORDER_STATES).filter(([value]) => value !== pedido.estado && value !== 'pendiente');
  footer.innerHTML = `
    <div>${isAdmin() ? `<button type="button" class="btn btn-outline-danger" data-action="detail-delete-order" data-id="${pedido.id_pedido}"><i class="bi bi-trash" aria-hidden="true"></i>Eliminar</button>` : ''}</div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      ${isFinalState(pedido.estado) ? '' : `
        <label for="detailState" class="visually-hidden">Nuevo estado</label>
        <select id="detailState" class="form-select" style="width:auto">
          ${options.map(([value, meta]) => `<option value="${value}" ${value === ORDER_FLOW[ORDER_FLOW.indexOf(pedido.estado) + 1] ? 'selected' : ''}>${meta.label}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-primary" data-action="detail-apply-state" data-id="${pedido.id_pedido}"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Actualizar estado</button>`}
      <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>
    </div>`;
}

/* =========================================================================
   Nuevo pedido (carrito)
   ========================================================================= */
const cart = new Map(); // id_producto -> { producto, cantidad }
let availableProducts = [];

function cartTotal() {
  let total = 0;
  for (const line of cart.values()) total += Number(line.producto.precio) * line.cantidad;
  return Math.round(total * 100) / 100;
}

function renderPicker() {
  const filter = document.getElementById('orderProductSearch').value.trim().toLowerCase();
  const picker = document.getElementById('productPicker');
  const items = availableProducts.filter((p) => !filter || p.nombre.toLowerCase().includes(filter));
  // Conserva el foco del teclado en el producto que se estaba usando tras volver a dibujar.
  const focusedId = picker.contains(document.activeElement) ? document.activeElement.dataset.addProduct : null;
  if (!availableProducts.length) {
    picker.innerHTML = `<div style="grid-column:1/-1">${stateBlock('empty', { title: 'No hay productos disponibles', text: isAdmin() ? 'Registra o habilita productos en el catálogo.' : 'Pide a un administrador que habilite productos en el catálogo.' })}</div>`;
    return;
  }
  if (!items.length) {
    picker.innerHTML = `<p class="text-muted small mb-0" style="grid-column:1/-1">Ningún producto coincide con “${escapeHtml(filter)}”.</p>`;
    return;
  }
  picker.innerHTML = items.map((p) => {
    const inCart = cart.get(p.id_producto)?.cantidad;
    return `<button type="button" class="picker-item" data-add-product="${p.id_producto}" aria-label="Agregar ${escapeHtml(p.nombre)}, ${money(p.precio)}${inCart ? `, ${inCart} en el pedido` : ''}">
      <strong>${escapeHtml(p.nombre)}</strong><span>${money(p.precio)}</span>
      ${inCart ? `<small class="in-cart"><i class="bi bi-check2" aria-hidden="true"></i> ${inCart} en el pedido</small>` : ''}
    </button>`;
  }).join('');
  if (focusedId) picker.querySelector(`[data-add-product="${focusedId}"]`)?.focus();
}

function renderCart() {
  const list = document.getElementById('cartList');
  if (!cart.size) {
    list.innerHTML = '<li class="cart-empty"><i class="bi bi-cart" aria-hidden="true"></i>Selecciona productos para agregarlos al pedido.</li>';
  } else {
    list.innerHTML = [...cart.values()].map(({ producto, cantidad }) => `
      <li class="cart-line">
        <div><div class="cart-line-name">${escapeHtml(producto.nombre)}</div><div class="cart-line-unit">${money(producto.precio)} c/u</div></div>
        <div class="cart-line-sub">${money(Number(producto.precio) * cantidad)}</div>
        <div class="cart-line-tools" style="grid-column:1/-1">
          <div class="qty-control" role="group" aria-label="Cantidad de ${escapeHtml(producto.nombre)}">
            <button type="button" data-qty-step="-1" data-id="${producto.id_producto}" aria-label="Disminuir cantidad"><i class="bi bi-dash" aria-hidden="true"></i></button>
            <input type="number" inputmode="numeric" min="1" max="${MAX_QTY}" step="1" value="${cantidad}" data-qty-input="${producto.id_producto}" aria-label="Cantidad de ${escapeHtml(producto.nombre)}">
            <button type="button" data-qty-step="1" data-id="${producto.id_producto}" aria-label="Aumentar cantidad" ${cantidad >= MAX_QTY ? 'disabled' : ''}><i class="bi bi-plus" aria-hidden="true"></i></button>
          </div>
          <button type="button" class="btn btn-sm btn-light ms-auto" data-remove-line="${producto.id_producto}" aria-label="Quitar ${escapeHtml(producto.nombre)} del pedido"><i class="bi bi-trash" aria-hidden="true"></i></button>
        </div>
      </li>`).join('');
  }
  document.getElementById('cartTotal').textContent = money(cartTotal());
  renderPicker();
}

function setQuantity(id, quantity) {
  const line = cart.get(id);
  if (!line) return;
  if (quantity < 1) { cart.delete(id); renderCart(); return; }
  line.cantidad = Math.min(MAX_QTY, Math.floor(quantity));
  if (quantity > MAX_QTY) toast(`La cantidad máxima por producto es ${MAX_QTY}.`, 'warning');
  renderCart();
}

function addProduct(id) {
  const producto = availableProducts.find((p) => p.id_producto === id);
  if (!producto) return;
  const line = cart.get(id);
  if (line) { setQuantity(id, line.cantidad + 1); return; }
  if (cart.size >= MAX_LINES) { toast(`Un pedido admite como máximo ${MAX_LINES} productos distintos.`, 'warning'); return; }
  cart.set(id, { producto, cantidad: 1 });
  hideFormError();
  renderCart();
}

async function loadClientOptions(selectedId) {
  const select = document.getElementById('orderClient');
  const q = document.getElementById('orderClientSearch').value.trim();
  const current = selectedId ?? select.value;
  select.disabled = true;
  try {
    const { datos, paginacion } = await api('/api/clientes', { query: { q, limit: 100 } });
    select.innerHTML = `<option value="">${datos.length ? 'Selecciona un cliente' : q ? 'Sin coincidencias' : 'No hay clientes registrados'}</option>`
      + datos.map((c) => `<option value="${c.id_cliente}">${escapeHtml(c.nombre)} · ${escapeHtml(c.telefono)}</option>`).join('');
    if (paginacion.total > datos.length) select.insertAdjacentHTML('beforeend', '<option disabled>Hay más clientes: usa el buscador para encontrarlos</option>');
    if (current && datos.some((c) => String(c.id_cliente) === String(current))) select.value = String(current);
    else if (datos.length === 1 && q) select.value = String(datos[0].id_cliente);
    if (select.value) select.classList.remove('is-invalid');
  } catch (error) {
    toastError(error);
  } finally {
    select.disabled = false;
  }
}

async function loadAvailableProducts() {
  document.getElementById('productPicker').innerHTML = stateBlock('loading', { title: 'Cargando productos…' });
  try {
    // Solo productos disponibles: es lo que el backend acepta en un pedido.
    const { datos } = await api('/api/productos', { query: { limit: 100 } });
    availableProducts = datos.filter((p) => p.disponible);
    // Si un producto del carrito dejó de estar disponible, se retira.
    for (const id of cart.keys()) if (!availableProducts.some((p) => p.id_producto === id)) cart.delete(id);
  } catch (error) {
    availableProducts = [];
    document.getElementById('productPicker').innerHTML = stateBlock('error', { text: error.message });
    return;
  }
  renderCart();
}

function showFormError(message) {
  const box = document.getElementById('orderFormError');
  box.textContent = message;
  box.hidden = false;
}
function hideFormError() { document.getElementById('orderFormError').hidden = true; }

function resetOrderForm() {
  cart.clear();
  document.getElementById('orderForm').reset();
  document.getElementById('orderNotesCount').textContent = '0';
  document.getElementById('orderClient').classList.remove('is-invalid');
  hideFormError();
}

async function openNewOrder({ keepDraft = false } = {}) {
  if (!keepDraft) resetOrderForm();
  modal('orderModal').show();
  await Promise.all([loadClientOptions(), loadAvailableProducts()]);
}

async function submitOrder(event) {
  event.preventDefault();
  hideFormError();
  const clientSelect = document.getElementById('orderClient');
  const notes = document.getElementById('orderNotes').value.trim();

  if (!clientSelect.value) {
    clientSelect.classList.add('is-invalid');
    showFormError('Selecciona el cliente del pedido.');
    clientSelect.focus();
    return;
  }
  if (!cart.size) {
    showFormError('Agrega al menos un producto al pedido.');
    document.getElementById('orderProductSearch').focus();
    return;
  }
  const lines = [...cart.values()];
  if (lines.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > MAX_QTY)) {
    showFormError(`Cada cantidad debe ser un número entero entre 1 y ${MAX_QTY}.`);
    return;
  }

  const button = document.getElementById('orderSubmit');
  setBusy(button, true, 'Registrando…');
  try {
    const data = await api('/api/pedidos', {
      method: 'POST',
      body: {
        id_cliente: Number(clientSelect.value),
        productos: lines.map((l) => ({ id_producto: l.producto.id_producto, cantidad: l.cantidad })),
        observaciones: notes || null
      }
    });
    modal('orderModal').hide();
    resetOrderForm();
    toast(`Pedido #${data.pedido.id_pedido} registrado por ${money(data.pedido.total)}.`, 'success', 'Pedido registrado');
    emit('orders-changed');
  } catch (error) {
    showFormError(error.message);
    // Un 400 puede deberse a un producto deshabilitado mientras se capturaba: se refresca el catálogo.
    if (error.status === 400) loadAvailableProducts();
  } finally {
    setBusy(button, false);
  }
}

function setupBuilder() {
  const form = document.getElementById('orderForm');
  form.setAttribute('novalidate', '');
  form.addEventListener('submit', submitOrder);

  document.getElementById('orderClientSearch').addEventListener('input', debounce(() => loadClientOptions(), 300));
  document.getElementById('orderClient').addEventListener('change', (event) => {
    event.target.classList.toggle('is-invalid', !event.target.value);
    if (event.target.value) hideFormError();
  });
  document.getElementById('orderProductSearch').addEventListener('input', renderPicker);
  document.getElementById('orderNotes').addEventListener('input', (event) => {
    document.getElementById('orderNotesCount').textContent = String(event.target.value.length);
  });

  document.getElementById('productPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-product]');
    if (button) addProduct(Number(button.dataset.addProduct));
  });
  const cartList = document.getElementById('cartList');
  cartList.addEventListener('click', (event) => {
    const step = event.target.closest('[data-qty-step]');
    if (step) {
      const id = Number(step.dataset.id);
      setQuantity(id, (cart.get(id)?.cantidad || 0) + Number(step.dataset.qtyStep));
      cartList.querySelector(`[data-qty-step="${step.dataset.qtyStep}"][data-id="${id}"]`)?.focus();
      return;
    }
    const remove = event.target.closest('[data-remove-line]');
    if (remove) {
      cart.delete(Number(remove.dataset.removeLine));
      renderCart();
      (cartList.querySelector('[data-remove-line]') || document.getElementById('orderProductSearch')).focus();
    }
  });
  cartList.addEventListener('change', (event) => {
    const input = event.target.closest('[data-qty-input]');
    if (!input) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 1) {
      toast('La cantidad debe ser al menos 1. Para quitar un producto usa el botón de eliminar.', 'warning');
      renderCart();
      return;
    }
    setQuantity(Number(input.dataset.qtyInput), value);
  });

  // Registrar un cliente sin perder el pedido en captura.
  onAction('order-new-client', () => {
    const orderModalEl = document.getElementById('orderModal');
    orderModalEl.addEventListener('hidden.bs.modal', () => {
      openClientForm(null, {
        onDone: (savedId) => {
          document.getElementById('orderClientSearch').value = '';
          openNewOrder({ keepDraft: true }).then(() => { if (savedId) loadClientOptions(savedId); });
        }
      });
    }, { once: true });
    modal('orderModal').hide();
  });
}

/* =========================================================================
   Inicialización
   ========================================================================= */
export function init() {
  setupBuilder();

  document.getElementById('orderChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-state-filter]');
    if (!chip) return;
    listState.estado = chip.dataset.stateFilter;
    listState.page = 1;
    renderChips();
    loadList();
  });
  document.getElementById('orderSearch').addEventListener('input', debounce((event) => {
    listState.q = event.target.value.trim();
    listState.page = 1;
    loadList();
  }, 350));
  document.getElementById('orderSort').addEventListener('change', (event) => {
    listState.orden = event.target.value;
    listState.page = 1;
    loadList();
  });
  bindPagination(document.getElementById('ordersPager'), (page) => { listState.page = page; loadList(); });

  onAction('new-order', () => openNewOrder());
  onAction('reload-orders', refresh);
  onAction('view-order', (el) => openDetail(Number(el.dataset.id)));
  onAction('set-order-state', (el) => changeState(Number(el.dataset.id), el.dataset.state));
  onAction('delete-order', (el) => deleteOrder(Number(el.dataset.id)));
  onAction('detail-apply-state', async (el) => {
    const estado = document.getElementById('detailState').value;
    setBusy(el, true, 'Actualizando…');
    try {
      if (await changeState(Number(el.dataset.id), estado)) {
        await openDetail(Number(el.dataset.id));
        // El pie se vuelve a dibujar: se devuelve el foco al modal para no perder la navegación por teclado.
        const next = document.querySelector('#orderDetailFooter [data-action="detail-apply-state"], #orderDetailFooter [data-bs-dismiss="modal"]');
        (next || document.getElementById('orderDetailModal')).focus();
      }
    } finally { setBusy(el, false); }
  });
  onAction('detail-delete-order', async (el) => {
    const id = Number(el.dataset.id);
    modal('orderDetailModal').hide();
    if (!(await deleteOrder(id))) openDetail(id);
  });

  on('orders-changed', () => { if (!document.querySelector('[data-view="pedidos"]').hidden) refresh(); });
}

export function show() {
  // Permite enlaces directos como #/pedidos?estado=pendiente desde los KPIs del panel.
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const estado = params.get('estado');
  if (estado !== null && (estado === '' || ORDER_STATES[estado])) {
    listState.estado = estado;
    listState.page = 1;
  }
  renderChips();
  return refresh();
}

