const { pool } = require('../config/db');
const { parseId, parsePagination, cleanString, isEmail } = require('../utils/http');

async function listClients(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const pattern = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id_cliente, nombre, telefono, direccion, correo, fecha_creacion
       FROM clientes
      WHERE (? = '' OR nombre LIKE ? OR telefono LIKE ? OR correo LIKE ?)
      ORDER BY nombre LIMIT ? OFFSET ?`,
    [q, pattern, pattern, pattern, limit, offset]
  );
  return res.json({ datos: rows, paginacion: { page, limit } });
}

async function getClient(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const [rows] = await pool.execute(
    `SELECT id_cliente, nombre, telefono, direccion, correo, fecha_creacion FROM clientes WHERE id_cliente = ?`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  return res.json({ cliente: rows[0] });
}

async function createClient(req, res) {
  const nombre = cleanString(req.body.nombre, 120);
  const telefono = cleanString(req.body.telefono, 25);
  const direccion = req.body.direccion == null || req.body.direccion === '' ? null : cleanString(req.body.direccion, 255);
  const correo = req.body.correo == null || req.body.correo === '' ? null : String(req.body.correo).trim().toLowerCase();
  if (!nombre || !telefono || (req.body.direccion && !direccion) || (correo && !isEmail(correo))) {
    return res.status(400).json({ mensaje: 'Nombre y telefono son obligatorios. Revisa direccion y correo.' });
  }
  const [result] = await pool.execute(
    `INSERT INTO clientes (nombre, telefono, direccion, correo) VALUES (?, ?, ?, ?)`,
    [nombre, telefono, direccion, correo]
  );
  return res.status(201).json({ mensaje: 'Cliente registrado.', id_cliente: result.insertId });
}

async function updateClient(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const nombre = cleanString(req.body.nombre, 120);
  const telefono = cleanString(req.body.telefono, 25);
  const direccion = req.body.direccion == null || req.body.direccion === '' ? null : cleanString(req.body.direccion, 255);
  const correo = req.body.correo == null || req.body.correo === '' ? null : String(req.body.correo).trim().toLowerCase();
  if (!nombre || !telefono || (req.body.direccion && !direccion) || (correo && !isEmail(correo))) {
    return res.status(400).json({ mensaje: 'Datos de cliente incompletos o no validos.' });
  }
  const [result] = await pool.execute(
    `UPDATE clientes SET nombre = ?, telefono = ?, direccion = ?, correo = ? WHERE id_cliente = ?`,
    [nombre, telefono, direccion, correo, id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Cliente no encontrado o sin cambios.' });
  return res.json({ mensaje: 'Cliente actualizado.' });
}

async function deleteClient(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });
  const [result] = await pool.execute(`DELETE FROM clientes WHERE id_cliente = ?`, [id]);
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  return res.json({ mensaje: 'Cliente eliminado.' });
}

module.exports = { listClients, getClient, createClient, updateClient, deleteClient };
