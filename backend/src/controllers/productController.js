const { pool } = require('../config/db');
const { parseId, parsePagination, cleanString } = require('../utils/http');

async function listProducts(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const includeUnavailable = req.user.rol === 'administrador' && req.query.todos === 'true';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const pattern = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id_producto, nombre, descripcion, precio, disponible, fecha_creacion
       FROM productos
      WHERE (? = '' OR nombre LIKE ?)
        AND (? = 1 OR disponible = 1)
      ORDER BY nombre LIMIT ? OFFSET ?`,
    [q, pattern, includeUnavailable ? 1 : 0, limit, offset]
  );
  const [[count]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM productos
      WHERE (? = '' OR nombre LIKE ?)
        AND (? = 1 OR disponible = 1)`,
    [q, pattern, includeUnavailable ? 1 : 0]
  );
  return res.json({ datos: rows, paginacion: { page, limit, total: Number(count.total) } });
}

async function createProduct(req, res) {
  const nombre = cleanString(req.body.nombre, 120);
  const descripcion = req.body.descripcion == null || req.body.descripcion === '' ? null : cleanString(req.body.descripcion, 500);
  const precio = Number(req.body.precio);
  if (!nombre || (req.body.descripcion && !descripcion) || !Number.isFinite(precio) || precio < 0) {
    return res.status(400).json({ mensaje: 'Nombre, descripcion o precio no validos.' });
  }
  const [result] = await pool.execute(
    `INSERT INTO productos (nombre, descripcion, precio) VALUES (?, ?, ?)`,
    [nombre, descripcion, precio]
  );
  return res.status(201).json({ mensaje: 'Producto registrado.', id_producto: result.insertId });
}

async function updateProduct(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const nombre = cleanString(req.body.nombre, 120);
  const descripcion = req.body.descripcion == null || req.body.descripcion === '' ? null : cleanString(req.body.descripcion, 500);
  const precio = Number(req.body.precio);
  if (!nombre || (req.body.descripcion && !descripcion) || !Number.isFinite(precio) || precio < 0) {
    return res.status(400).json({ mensaje: 'Nombre, descripcion o precio no validos.' });
  }
  const [result] = await pool.execute(
    `UPDATE productos SET nombre = ?, descripcion = ?, precio = ? WHERE id_producto = ?`,
    [nombre, descripcion, precio, id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Producto no encontrado o sin cambios.' });
  return res.json({ mensaje: 'Producto actualizado.' });
}

async function changeProductAvailability(req, res) {
  const id = parseId(req.params.id);
  const disponible = req.body.disponible;
  if (!id || typeof disponible !== 'boolean') {
    return res.status(400).json({ mensaje: 'Indica id y disponible como true o false.' });
  }
  const [result] = await pool.execute(
    `UPDATE productos SET disponible = ? WHERE id_producto = ?`,
    [disponible ? 1 : 0, id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
  return res.json({ mensaje: `Producto ${disponible ? 'habilitado' : 'deshabilitado'}.` });
}

async function deleteProduct(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  // Baja logica: se conserva el producto porque puede estar referenciado por pedidos historicos.
  const [result] = await pool.execute(
    `UPDATE productos SET disponible = 0 WHERE id_producto = ?`, [id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
  return res.json({ mensaje: 'Producto deshabilitado (baja logica).' });
}

module.exports = { listProducts, createProduct, updateProduct, changeProductAvailability, deleteProduct };
