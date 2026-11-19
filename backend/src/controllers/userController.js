const argon2 = require('argon2');
const { pool } = require('../config/db');
const { parseId, parsePagination, cleanString, isEmail } = require('../utils/http');

const ROLES = ['administrador', 'empleado'];

async function listUsers(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const [rows] = await pool.execute(
    `SELECT id_usuario, nombre, correo, rol, activo, fecha_creacion
       FROM usuarios ORDER BY id_usuario DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM usuarios`);
  return res.json({ datos: rows, paginacion: { page, limit, total: Number(count.total) } });
}

async function createUser(req, res) {
  const nombre = cleanString(req.body.nombre, 100);
  const correo = typeof req.body.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const rol = req.body.rol || 'empleado';

  if (!nombre || !isEmail(correo) || password.length < 10 || !ROLES.includes(rol)) {
    return res.status(400).json({ mensaje: 'Revisa nombre, correo, rol y contrasena (minimo 10 caracteres).' });
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const [result] = await pool.execute(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol)
     VALUES (?, ?, ?, ?)`,
    [nombre, correo, passwordHash, rol]
  );

  return res.status(201).json({
    mensaje: 'Usuario creado correctamente.',
    usuario: { id_usuario: result.insertId, nombre, correo, rol, activo: 1 }
  });
}

async function updateUser(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ mensaje: 'Identificador no valido.' });

  const nombre = cleanString(req.body.nombre, 100);
  const correo = typeof req.body.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
  const rol = req.body.rol;
  const password = req.body.password;
  if (!nombre || !isEmail(correo) || !ROLES.includes(rol)) {
    return res.status(400).json({ mensaje: 'Nombre, correo o rol no validos.' });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 10)) {
    return res.status(400).json({ mensaje: 'La nueva contrasena debe tener al menos 10 caracteres.' });
  }
  if (id === Number(req.user.id_usuario) && rol !== 'administrador') {
    return res.status(400).json({ mensaje: 'No puedes quitarte tu propio rol de administrador.' });
  }

  if (password) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [result] = await pool.execute(
      `UPDATE usuarios SET nombre = ?, correo = ?, rol = ?, password_hash = ? WHERE id_usuario = ?`,
      [nombre, correo, rol, passwordHash, id]
    );
    if (!result.affectedRows) return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
  } else {
    const [result] = await pool.execute(
      `UPDATE usuarios SET nombre = ?, correo = ?, rol = ? WHERE id_usuario = ?`,
      [nombre, correo, rol, id]
    );
    if (!result.affectedRows) return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
  }
  return res.json({ mensaje: 'Usuario actualizado correctamente.' });
}

async function updateUserStatus(req, res) {
  const id = parseId(req.params.id);
  const activo = req.body.activo;
  if (!id || typeof activo !== 'boolean') {
    return res.status(400).json({ mensaje: 'Indica un identificador y activo como true o false.' });
  }
  if (id === Number(req.user.id_usuario) && !activo) {
    return res.status(400).json({ mensaje: 'No puedes desactivar tu propia cuenta.' });
  }
  const [result] = await pool.execute(
    `UPDATE usuarios SET activo = ? WHERE id_usuario = ?`,
    [activo ? 1 : 0, id]
  );
  if (!result.affectedRows) return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
  return res.json({ mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente.` });
}

module.exports = { listUsers, createUser, updateUser, updateUserStatus };
