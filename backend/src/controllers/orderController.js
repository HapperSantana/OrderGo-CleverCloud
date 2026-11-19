const { pool } = require('../config/db');
const { parseId, parsePagination, cleanString } = require('../utils/http');

const STATES = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'];

async function listOrders(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const estado = typeof req.query.estado === 'string' && STATES.includes(req.query.estado) ? req.query.estado : '';
  const [rows] = await pool.execute(
    `SELECT p.id_pedido, p.fecha, p.total, p.estado, p.observaciones,
            c.id_cliente, c.nombre AS cliente,
            u.id_usuario, u.nombre AS registrado_por
       FROM pedidos p
       INNER JOIN clientes c ON c.id_cliente = p.id_cliente
       INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE (? = '' OR p.estado = ?)
      ORDER BY p.fecha DESC, p.id_pedido DESC LIMIT ? OFFSET ?`,
    [estado, estado, limit, offset]
  );
  return res.json({ datos: rows, paginacion: { page, limit } });
}

async function getOrder(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const [orders] = await pool.execute(
    `SELECT p.id_pedido, p.fecha, p.total, p.estado, p.observaciones,
            c.id_cliente, c.nombre AS cliente, c.telefono,
            u.id_usuario, u.nombre AS registrado_por
       FROM pedidos p
       INNER JOIN clientes c ON c.id_cliente = p.id_cliente
       INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE p.id_pedido = ?`, [id]
  );
  if (!orders.length) return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
  const [items] = await pool.execute(
    `SELECT d.id_detalle, d.id_producto, pr.nombre AS producto,
            d.cantidad, d.precio_unitario, d.subtotal
       FROM detalle_pedido d
       INNER JOIN productos pr ON pr.id_producto = d.id_producto
      WHERE d.id_pedido = ? ORDER BY d.id_detalle`, [id]
  );
  return res.json({ pedido: orders[0], productos: items });
}

async function createOrder(req, res) {
  const idCliente = parseId(req.body.id_cliente);
  const items = req.body.productos;
  const observaciones = req.body.observaciones == null || req.body.observaciones === ''
    ? null : cleanString(req.body.observaciones, 500);

  if (!idCliente || !Array.isArray(items) || items.length < 1 || items.length > 30 || (req.body.observaciones && !observaciones)) {
    return res.status(400).json({ mensaje: 'Indica un cliente y entre 1 y 30 productos validos.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [clientRows] = await connection.execute(
      `SELECT id_cliente FROM clientes WHERE id_cliente = ?`, [idCliente]
    );
    if (!clientRows.length) {
      await connection.rollback();
      return res.status(400).json({ mensaje: 'El cliente seleccionado no existe.' });
    }

    const [orderResult] = await connection.execute(
      `INSERT INTO pedidos (id_cliente, id_usuario, observaciones) VALUES (?, ?, ?)`,
      [idCliente, req.user.id_usuario, observaciones]
    );
    const orderId = orderResult.insertId;
    let total = 0;

    for (const item of items) {
      const productId = parseId(item.id_producto);
      const quantity = Number(item.cantidad);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        throw Object.assign(new Error('Cada producto requiere un identificador y cantidad entera entre 1 y 100.'), { status: 400 });
      }

      const [productRows] = await connection.execute(
        `SELECT id_producto, precio FROM productos WHERE id_producto = ? AND disponible = 1 FOR UPDATE`,
        [productId]
      );
      if (!productRows.length) {
        throw Object.assign(new Error(`El producto ${productId} no existe o no esta disponible.`), { status: 400 });
      }

      const unitPrice = Number(productRows[0].precio);
      const subtotal = Number((unitPrice * quantity).toFixed(2));
      total = Number((total + subtotal).toFixed(2));
      await connection.execute(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, productId, quantity, unitPrice, subtotal]
      );
    }

    await connection.execute(`UPDATE pedidos SET total = ? WHERE id_pedido = ?`, [total, orderId]);
    await connection.commit();
    return res.status(201).json({
      mensaje: 'Pedido registrado correctamente.',
      pedido: { id_pedido: orderId, id_cliente: idCliente, total, estado: 'pendiente' }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateOrderState(req, res) {
  const id = parseId(req.params.id);
  const estado = req.body.estado;
  if (!id || !STATES.includes(estado)) {
    return res.status(400).json({ mensaje: `Estado no valido. Valores: ${STATES.join(', ')}.` });
  }
  const [result] = await pool.execute(
    `UPDATE pedidos SET estado = ? WHERE id_pedido = ?`, [estado, id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
  return res.json({ mensaje: 'Estado del pedido actualizado.', id_pedido: id, estado });
}

async function deleteOrder(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const [result] = await pool.execute(`DELETE FROM pedidos WHERE id_pedido = ?`, [id]);
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
  return res.json({ mensaje: 'Pedido eliminado.' });
}

module.exports = { listOrders, getOrder, createOrder, updateOrderState, deleteOrder };
