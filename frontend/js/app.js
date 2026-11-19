const token = sessionStorage.getItem('ordergo_token');
if (!token) window.location.replace('/login.html');

let currentUser = null;
let toastTimer = null;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${sessionStorage.getItem('ordergo_token')}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { ...options, headers });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem('ordergo_token');
    window.location.replace('/login.html');
    throw new Error('Tu sesion expiro. Inicia sesion nuevamente.');
  }
  if (!response.ok) throw new Error(data.mensaje || `Error HTTP ${response.status}`);
  return data;
}

function setTab(name) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `${name}Section`));
  if (name === 'orders') loadOrders();
  if (name === 'clients') loadClients();
  if (name === 'products') loadProducts();
  if (name === 'users' && currentUser?.rol === 'administrador') loadUsers();
}

function stateLabel(state) {
  return ({ pendiente: 'Pendiente', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' })[state] || state;
}
function stateBadge(state) {
  const cls = state === 'entregado' ? 'badge-green' : state === 'cancelado' ? 'badge-red' : state === 'listo' ? 'badge-orange' : 'badge-gray';
  return `<span class="badge ${cls}">${escapeHtml(stateLabel(state))}</span>`;
}
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

async function loadProfile() {
  const data = await api('/api/auth/perfil');
  currentUser = data.usuario;
  $('#userName').textContent = currentUser.nombre;
  $('#userRole').textContent = currentUser.rol;
  if (currentUser.rol !== 'administrador') {
    $$('.admin-only').forEach((element) => element.classList.add('hidden'));
    // No se permite navegar a una seccion exclusiva de administracion.
    $('#usersSection').classList.add('hidden');
  }
}

async function loadClients() {
  const query = $('#clientSearch')?.value.trim() || '';
  try {
    const data = await api(`/api/clientes?limit=100&q=${encodeURIComponent(query)}`);
    $('#clientsTable').innerHTML = data.datos.length ? data.datos.map((client) => `
      <tr><td><strong>${escapeHtml(client.nombre)}</strong></td><td>${escapeHtml(client.telefono)}</td><td>${escapeHtml(client.correo || '-')}</td><td>${escapeHtml(client.direccion || '-')}</td>
      <td><div class="row-actions"><button class="btn btn-outline" data-action="edit-client" data-id="${client.id_cliente}">Editar</button>${currentUser.rol === 'administrador' ? `<button class="btn btn-danger" data-action="delete-client" data-id="${client.id_cliente}">Eliminar</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No hay clientes registrados.</td></tr>';
  } catch (error) { showToast(error.message, true); }
}

async function loadProducts() {
  try {
    const data = await api(`/api/productos?limit=100${currentUser.rol === 'administrador' ? '&todos=true' : ''}`);
    $('#productsTable').innerHTML = data.datos.length ? data.datos.map((product) => `
      <tr><td><strong>${escapeHtml(product.nombre)}</strong></td><td>${escapeHtml(product.descripcion || '-')}</td><td>${money(product.precio)}</td>
      <td>${product.disponible ? '<span class="badge badge-green">Disponible</span>' : '<span class="badge badge-gray">No disponible</span>'}</td>
      <td>${currentUser.rol === 'administrador' ? `<div class="row-actions"><button class="btn btn-outline" data-action="edit-product" data-id="${product.id_producto}">Editar</button><button class="btn ${product.disponible ? 'btn-danger' : 'btn-outline'}" data-action="toggle-product" data-id="${product.id_producto}" data-available="${product.disponible}">${product.disponible ? 'Deshabilitar' : 'Habilitar'}</button></div>` : '-'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No hay productos registrados.</td></tr>';
    $('#orderProduct').innerHTML = '<option value="">Selecciona un producto</option>' + data.datos.filter((p) => p.disponible).map((p) => `<option value="${p.id_producto}">${escapeHtml(p.nombre)} — ${money(p.precio)}</option>`).join('');
  } catch (error) { showToast(error.message, true); }
}

async function loadClientsForOrder() {
  const data = await api('/api/clientes?limit=100');
  $('#orderClient').innerHTML = '<option value="">Selecciona un cliente</option>' + data.datos.map((client) => `<option value="${client.id_cliente}">${escapeHtml(client.nombre)} (${escapeHtml(client.telefono)})</option>`).join('');
}

async function loadOrders() {
  const state = $('#orderFilter')?.value || '';
  try {
    const data = await api(`/api/pedidos?limit=100${state ? `&estado=${encodeURIComponent(state)}` : ''}`);
    $('#ordersTable').innerHTML = data.datos.length ? data.datos.map((order) => `
      <tr><td><strong>#${order.id_pedido}</strong></td><td>${escapeHtml(order.cliente)}</td><td>${dateLabel(order.fecha)}</td><td>${money(order.total)}</td><td>${stateBadge(order.estado)}</td><td>${escapeHtml(order.registrado_por)}</td>
      <td><div class="row-actions"><button class="btn btn-outline" data-action="view-order" data-id="${order.id_pedido}">Detalle</button>${order.estado !== 'entregado' && order.estado !== 'cancelado' ? `<select aria-label="Cambiar estado del pedido ${order.id_pedido}" data-action="change-order-state" data-id="${order.id_pedido}" class="order-state-select"><option value="">Cambiar estado</option><option value="en_preparacion">En preparación</option><option value="listo">Listo</option><option value="entregado">Entregado</option><option value="cancelado">Cancelado</option></select>` : ''}${currentUser.rol === 'administrador' ? `<button class="btn btn-danger" data-action="delete-order" data-id="${order.id_pedido}">Eliminar</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No hay pedidos para mostrar.</td></tr>';
  } catch (error) { showToast(error.message, true); }
}

async function loadUsers() {
  try {
    const data = await api('/api/usuarios?limit=100');
    $('#usersTable').innerHTML = data.datos.length ? data.datos.map((user) => `
      <tr><td><strong>${escapeHtml(user.nombre)}</strong></td><td>${escapeHtml(user.correo)}</td><td>${escapeHtml(user.rol)}</td>
      <td>${user.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Inactivo</span>'}</td>
      <td>${Number(user.id_usuario) === Number(currentUser.id_usuario) ? '<span class="muted">Sesión actual</span>' : `<button class="btn btn-outline" data-action="toggle-user" data-id="${user.id_usuario}" data-active="${user.activo}">${user.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No hay usuarios.</td></tr>';
  } catch (error) { showToast(error.message, true); }
}

$('#logoutButton').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { /* Se limpia la sesion local de cualquier modo. */ }
  sessionStorage.removeItem('ordergo_token');
  window.location.replace('/login.html');
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  if (tab.dataset.tab === 'users' && currentUser?.rol !== 'administrador') return;
  setTab(tab.dataset.tab);
}));

$('#clientForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    nombre: $('#clientName').value.trim(), telefono: $('#clientPhone').value.trim(),
    correo: $('#clientEmail').value.trim() || null, direccion: $('#clientAddress').value.trim() || null
  };
  try {
    await api('/api/clientes', { method: 'POST', body: JSON.stringify(body) });
    event.target.reset(); showToast('Cliente registrado.'); await loadClients(); await loadClientsForOrder();
  } catch (error) { showToast(error.message, true); }
});

$('#clientSearch').addEventListener('input', () => {
  clearTimeout(window.clientSearchTimer);
  window.clientSearchTimer = setTimeout(loadClients, 250);
});

$('#productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = { nombre: $('#productName').value.trim(), descripcion: $('#productDescription').value.trim() || null, precio: Number($('#productPrice').value) };
  try {
    await api('/api/productos', { method: 'POST', body: JSON.stringify(body) });
    event.target.reset(); showToast('Producto registrado.'); await loadProducts();
  } catch (error) { showToast(error.message, true); }
});

$('#orderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    id_cliente: Number($('#orderClient').value),
    productos: [{ id_producto: Number($('#orderProduct').value), cantidad: Number($('#orderQuantity').value) }],
    observaciones: $('#orderNotes').value.trim() || null
  };
  try {
    const data = await api('/api/pedidos', { method: 'POST', body: JSON.stringify(body) });
    event.target.reset(); $('#orderQuantity').value = '1'; showToast(`${data.mensaje} Pedido #${data.pedido.id_pedido}.`); await loadOrders();
  } catch (error) { showToast(error.message, true); }
});

$('#userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    nombre: $('#newUserName').value.trim(), correo: $('#newUserEmail').value.trim(),
    password: $('#newUserPassword').value, rol: $('#newUserRole').value
  };
  try {
    await api('/api/usuarios', { method: 'POST', body: JSON.stringify(body) });
    event.target.reset(); showToast('Usuario creado.'); await loadUsers();
  } catch (error) { showToast(error.message, true); }
});

$('#orderFilter').addEventListener('change', loadOrders);
$('#refreshOrders').addEventListener('click', loadOrders);
$('#refreshProducts').addEventListener('click', loadProducts);
$('#refreshUsers').addEventListener('click', loadUsers);

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'delete-client') {
      if (!confirm('¿Eliminar este cliente? Si tiene pedidos asociados, MySQL impedira la eliminacion.')) return;
      await api(`/api/clientes/${id}`, { method: 'DELETE' }); showToast('Cliente eliminado.'); await loadClients(); await loadClientsForOrder();
    }
    if (action === 'edit-client') {
      const detail = await api(`/api/clientes/${id}`);
      const client = detail.cliente;
      const nombre = prompt('Nombre del cliente:', client.nombre);
      if (nombre === null) return;
      const telefono = prompt('Telefono:', client.telefono);
      if (telefono === null) return;
      await api(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, telefono, direccion: client.direccion, correo: client.correo }) });
      showToast('Cliente actualizado.'); await loadClients(); await loadClientsForOrder();
    }
    if (action === 'edit-product') {
      const products = await api('/api/productos?todos=true&limit=100');
      const product = products.datos.find((p) => Number(p.id_producto) === Number(id));
      if (!product) return;
      const nombre = prompt('Nombre del producto:', product.nombre); if (nombre === null) return;
      const precio = prompt('Precio:', product.precio); if (precio === null) return;
      const descripcion = prompt('Descripcion:', product.descripcion || ''); if (descripcion === null) return;
      await api(`/api/productos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, precio: Number(precio), descripcion }) });
      showToast('Producto actualizado.'); await loadProducts();
    }
    if (action === 'toggle-product') {
      const available = button.dataset.available === '1' || button.dataset.available === 'true';
      await api(`/api/productos/${id}/disponibilidad`, { method: 'PATCH', body: JSON.stringify({ disponible: !available }) });
      showToast('Disponibilidad actualizada.'); await loadProducts();
    }
    if (action === 'view-order') {
      const detail = await api(`/api/pedidos/${id}`);
      const lines = detail.productos.map((item) => `${item.cantidad} x ${item.producto} — ${money(item.subtotal)}`).join('\n');
      alert(`Pedido #${id}\nCliente: ${detail.pedido.cliente}\nEstado: ${stateLabel(detail.pedido.estado)}\nTotal: ${money(detail.pedido.total)}\n\n${lines}\n\nObservaciones: ${detail.pedido.observaciones || 'Ninguna'}`);
    }
    if (action === 'delete-order') {
      if (!confirm(`¿Eliminar el pedido #${id}?`)) return;
      await api(`/api/pedidos/${id}`, { method: 'DELETE' }); showToast('Pedido eliminado.'); await loadOrders();
    }
    if (action === 'toggle-user') {
      const active = button.dataset.active === '1' || button.dataset.active === 'true';
      if (!confirm(`¿${active ? 'Desactivar' : 'Activar'} esta cuenta?`)) return;
      await api(`/api/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo: !active }) });
      showToast('Estado de usuario actualizado.'); await loadUsers();
    }
  } catch (error) { showToast(error.message, true); }
});

document.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-action="change-order-state"]');
  if (!select || !select.value) return;
  try {
    await api(`/api/pedidos/${select.dataset.id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado: select.value }) });
    showToast('Estado del pedido actualizado.'); await loadOrders();
  } catch (error) { showToast(error.message, true); }
});

(async function init() {
  try {
    await loadProfile();
    await Promise.all([loadClientsForOrder(), loadProducts()]);
    await loadOrders();
  } catch (error) {
    showToast(error.message, true);
  }
})();
