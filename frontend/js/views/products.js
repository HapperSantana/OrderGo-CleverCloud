// Módulo de productos: catálogo en tarjetas con búsqueda y paginación.
// El administrador registra, edita y habilita/deshabilita; el empleado solo consulta los disponibles.
import { api } from '../core/api.js';
import { isAdmin } from '../core/session.js';
import {
  escapeHtml, money, activeBadge, stateBlock, renderPagination, bindPagination,
  debounce, setBusy, toast, toastError, confirmDialog, modal, onAction, emit, on
} from '../core/ui.js';
import { validateForm, clearValidation, liveValidation } from '../core/validation.js';

const listState = { page: 1, limit: 12, q: '', filtro: 'todos' };
let listRequest = 0;
const cache = new Map();
let editing = null;

function productCard(p) {
  const off = !p.disponible;
  return `
    <article class="og-card product-card ${off ? 'is-off' : ''}" aria-labelledby="product-${p.id_producto}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <span class="product-thumb" aria-hidden="true"><i class="bi ${off ? 'bi-slash-circle' : 'bi-egg-fried'}"></i></span>
        ${activeBadge(p.disponible, ['Disponible', 'Deshabilitado'])}
      </div>
      <h3 class="product-name" id="product-${p.id_producto}">${escapeHtml(p.nombre)}</h3>
      <p class="product-desc">${escapeHtml(p.descripcion || 'Sin descripción.')}</p>
      <div class="product-price">${money(p.precio)}</div>
      ${isAdmin() ? `<div class="product-actions">
        <button type="button" class="btn btn-sm btn-light" data-action="edit-product" data-id="${p.id_producto}"><i class="bi bi-pencil" aria-hidden="true"></i>Editar<span class="visually-hidden"> ${escapeHtml(p.nombre)}</span></button>
        <button type="button" class="btn btn-sm ${off ? 'btn-success' : 'btn-outline-danger'}" data-action="toggle-product" data-id="${p.id_producto}">
          <i class="bi ${off ? 'bi-check-circle' : 'bi-pause-circle'}" aria-hidden="true"></i>${off ? 'Habilitar' : 'Deshabilitar'}<span class="visually-hidden"> ${escapeHtml(p.nombre)}</span>
        </button>
      </div>` : ''}
    </article>`;
}

async function loadList() {
  const requestId = ++listRequest;
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = stateBlock('loading', { title: 'Cargando catálogo…' });
  grid.setAttribute('aria-busy', 'true');
  try {
    const query = { page: listState.page, limit: listState.limit, q: listState.q };
    if (isAdmin() && listState.filtro === 'todos') query.todos = 'true';
    const data = await api('/api/productos', { query });
    if (requestId !== listRequest) return;
    if (!data.datos.length && listState.page > 1 && data.paginacion.total) {
      listState.page = Math.ceil(data.paginacion.total / listState.limit);
      return loadList();
    }
    data.datos.forEach((p) => cache.set(p.id_producto, p));
    if (!data.datos.length) {
      grid.innerHTML = listState.q
        ? stateBlock('no-results', { text: `No hay productos que coincidan con “${listState.q}”.` })
        : stateBlock('empty', {
          title: 'El catálogo está vacío',
          text: isAdmin() ? 'Registra tu primer producto para empezar a tomar pedidos.' : 'Aún no hay productos disponibles. Un administrador debe registrarlos.',
          action: isAdmin() ? { name: 'new-product', label: 'Nuevo producto' } : undefined
        });
    } else {
      grid.innerHTML = `<div class="product-grid">${data.datos.map(productCard).join('')}</div>`;
    }
    renderPagination(document.getElementById('productsPager'), { ...data.paginacion, label: 'productos' });
  } catch (error) {
    if (requestId !== listRequest) return;
    grid.innerHTML = stateBlock('error', { text: error.message, action: { name: 'reload-products', label: 'Reintentar', icon: 'bi-arrow-clockwise' } });
    document.getElementById('productsPager').innerHTML = '';
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

function openForm(product = null) {
  if (!isAdmin()) return;
  const form = document.getElementById('productForm');
  form.reset();
  clearValidation(form);
  editing = product;
  document.getElementById('productModalTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('productSubmit').innerHTML = `<i class="bi bi-check-lg" aria-hidden="true"></i>${product ? 'Guardar cambios' : 'Registrar producto'}`;
  document.getElementById('productAvailabilityRow').hidden = !product;
  if (product) {
    document.getElementById('productName').value = product.nombre;
    document.getElementById('productPrice').value = Number(product.precio).toFixed(2);
    document.getElementById('productDescription').value = product.descripcion || '';
    document.getElementById('productAvailable').checked = Boolean(product.disponible);
  }
  document.getElementById('productDescriptionCount').textContent = String(document.getElementById('productDescription').value.length);
  modal('productModal').show();
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateForm(form)) return;
  const body = {
    nombre: document.getElementById('productName').value.trim(),
    precio: Math.round(Number(document.getElementById('productPrice').value) * 100) / 100,
    descripcion: document.getElementById('productDescription').value.trim() || null
  };
  const button = document.getElementById('productSubmit');
  setBusy(button, true);
  try {
    if (editing) {
      await api(`/api/productos/${editing.id_producto}`, { method: 'PUT', body });
      const available = document.getElementById('productAvailable').checked;
      if (available !== Boolean(editing.disponible)) {
        await api(`/api/productos/${editing.id_producto}/disponibilidad`, { method: 'PATCH', body: { disponible: available } });
      }
      toast(`Se guardaron los cambios de ${body.nombre}.`, 'success', 'Producto actualizado');
    } else {
      await api('/api/productos', { method: 'POST', body });
      toast(`${body.nombre} se agregó al catálogo.`, 'success', 'Producto registrado');
    }
    modal('productModal').hide();
    emit('products-changed');
  } catch (error) {
    toastError(error);
  } finally {
    setBusy(button, false);
  }
}

async function toggleProduct(id) {
  const product = cache.get(id);
  if (!product) return;
  const enable = !product.disponible;
  if (!enable) {
    const ok = await confirmDialog({
      title: '¿Deshabilitar producto?',
      message: `${product.nombre} dejará de aparecer para nuevos pedidos. Los pedidos anteriores no se modifican.`,
      confirmText: 'Deshabilitar',
      variant: 'warning',
      icon: 'bi-pause-circle'
    });
    if (!ok) return;
  }
  await api(`/api/productos/${id}/disponibilidad`, { method: 'PATCH', body: { disponible: enable } });
  toast(`${product.nombre} ${enable ? 'está disponible nuevamente' : 'ya no está disponible para pedidos'}.`, 'success', enable ? 'Producto habilitado' : 'Producto deshabilitado');
  emit('products-changed');
}

export function init() {
  const form = document.getElementById('productForm');
  liveValidation(form);
  form.addEventListener('submit', submitProduct);
  document.getElementById('productDescription').addEventListener('input', (event) => {
    document.getElementById('productDescriptionCount').textContent = String(event.target.value.length);
  });
  document.getElementById('productSearch').addEventListener('input', debounce((event) => {
    listState.q = event.target.value.trim();
    listState.page = 1;
    loadList();
  }, 300));
  document.getElementById('productFilter').addEventListener('change', (event) => {
    listState.filtro = event.target.value;
    listState.page = 1;
    loadList();
  });
  bindPagination(document.getElementById('productsPager'), (page) => { listState.page = page; loadList(); });
  document.getElementById('productsSubtitle').textContent = isAdmin()
    ? 'Administra el catálogo, precios y disponibilidad de los productos.'
    : 'Consulta los productos disponibles y sus precios.';

  onAction('new-product', () => openForm());
  onAction('reload-products', loadList);
  onAction('edit-product', (el) => openForm(cache.get(Number(el.dataset.id))));
  onAction('toggle-product', (el) => toggleProduct(Number(el.dataset.id)));
  on('products-changed', () => { if (!document.querySelector('[data-view="productos"]').hidden) loadList(); });
}

export const show = loadList;
