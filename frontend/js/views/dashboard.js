// Panel principal: indicadores reales obtenidos de GET /api/pedidos/resumen (consultas COUNT en MySQL).
import { api } from '../core/api.js';
import { escapeHtml, money, dateLabel, statusBadge, numberLabel, stateBlock, skeletonRows, onAction, on, ORDER_STATES } from '../core/ui.js';

const KPIS = [
  { key: (r) => r.pedidos.total, label: 'Total de pedidos', icon: 'bi-receipt', tone: 'navy', href: '#/pedidos', hint: 'Histórico registrado' },
  { key: (r) => r.pedidos.pendiente, label: 'Pendientes', icon: 'bi-hourglass-split', tone: 'warning', href: '#/pedidos?estado=pendiente', hint: 'Por atender' },
  { key: (r) => r.pedidos.en_preparacion, label: 'En preparación', icon: 'bi-fire', tone: 'info', href: '#/pedidos?estado=en_preparacion', hint: 'En cocina' },
  { key: (r) => r.pedidos.entregado, label: 'Entregados', icon: 'bi-check-circle', tone: 'success', href: '#/pedidos?estado=entregado', hint: 'Completados' },
  { key: (r) => r.clientes, label: 'Clientes', icon: 'bi-people', tone: 'orange', href: '#/clientes', hint: 'Registrados' },
  { key: (r) => r.productos_disponibles, label: 'Productos disponibles', icon: 'bi-basket', tone: 'teal', href: '#/productos', hint: 'En el catálogo' }
];

let loading = false;

function renderKpis(resumen) {
  document.getElementById('kpiGrid').innerHTML = KPIS.map((kpi) => `
    <a class="og-card kpi-card" href="${kpi.href}">
      <div class="kpi-top"><span class="kpi-label">${kpi.label}</span><span class="kpi-icon tone-${kpi.tone}"><i class="bi ${kpi.icon}" aria-hidden="true"></i></span></div>
      <div class="kpi-value">${resumen ? numberLabel(kpi.key(resumen)) : '<span class="skeleton" aria-hidden="true"></span><span class="visually-hidden">Cargando</span>'}</div>
      <div class="kpi-hint">${kpi.hint}</div>
    </a>`).join('');
}

function renderDistribution(pedidos) {
  const container = document.getElementById('stateDistribution');
  if (!pedidos.total) {
    container.innerHTML = '<p class="text-muted small mb-0">Aún no hay pedidos para mostrar la distribución.</p>';
    return;
  }
  const states = Object.keys(ORDER_STATES);
  container.innerHTML = `
    <div class="state-bar" role="img" aria-label="Distribución de pedidos por estado">
      ${states.filter((s) => pedidos[s]).map((s) => `<span class="bg-state-${s}" style="flex:${pedidos[s]}"></span>`).join('')}
    </div>
    <ul class="state-legend">
      ${states.map((s) => `<li><span class="d-flex align-items-center gap-2"><span class="dot bg-state-${s}" aria-hidden="true"></span>${ORDER_STATES[s].label}</span>
        <span class="tabular"><strong>${numberLabel(pedidos[s])}</strong> <span class="text-muted">· ${Math.round((pedidos[s] / pedidos.total) * 100)}%</span></span></li>`).join('')}
    </ul>`;
}

function renderRecent(rows) {
  const tbody = document.getElementById('recentOrders');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">${stateBlock('empty', { title: 'Todavía no hay pedidos', text: 'Registra el primer pedido del día para verlo aquí.', action: { name: 'new-order', label: 'Registrar pedido' } })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((order) => `
    <tr>
      <td><button type="button" class="btn btn-link p-0 order-id text-decoration-none" data-action="view-order" data-id="${order.id_pedido}" aria-label="Ver detalle del pedido ${order.id_pedido}">#${order.id_pedido}</button></td>
      <td><span class="cell-main">${escapeHtml(order.cliente)}</span><span class="cell-sub d-md-none">${dateLabel(order.fecha)}</span></td>
      <td class="d-none d-md-table-cell text-muted">${dateLabel(order.fecha)}</td>
      <td class="text-end fw-semibold tabular">${money(order.total)}</td>
      <td>${statusBadge(order.estado)}</td>
    </tr>`).join('');
}

async function load() {
  if (loading) return;
  loading = true;
  renderKpis(null);
  document.getElementById('recentOrders').innerHTML = skeletonRows(5, 5);
  try {
    const { resumen, recientes } = await api('/api/pedidos/resumen');
    renderKpis(resumen);
    renderDistribution(resumen.pedidos);
    renderRecent(recientes);
  } catch (error) {
    document.getElementById('kpiGrid').innerHTML = `<div class="og-card" style="grid-column:1/-1">${stateBlock('error', { text: error.message, action: { name: 'refresh-dashboard', label: 'Reintentar', icon: 'bi-arrow-clockwise' } })}</div>`;
    document.getElementById('recentOrders').innerHTML = '';
    document.getElementById('stateDistribution').innerHTML = '';
  } finally {
    loading = false;
  }
}

export function init() {
  onAction('refresh-dashboard', load);
  // Mantiene el panel al día cuando otra vista modifica datos.
  on('orders-changed', () => { if (!document.querySelector('[data-view="panel"]').hidden) load(); });
}

export const show = load;
