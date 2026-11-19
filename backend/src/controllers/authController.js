const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { cleanString, isEmail } = require('../utils/http');

async function login(req, res) {
  const correo = typeof req.body.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isEmail(correo) || !password) {
    return res.status(400).json({ mensaje: 'Proporciona un correo y una contrasena validos.' });
  }

  const [rows] = await pool.execute(
    `SELECT id_usuario, nombre, correo, password_hash, rol, activo
       FROM usuarios WHERE correo = ? LIMIT 1`,
    [correo]
  );

  // El mismo mensaje evita revelar si una cuenta existe.
  if (!rows.length || !rows[0].activo) {
    return res.status(401).json({ mensaje: 'Credenciales incorrectas o cuenta desactivada.' });
  }

  const user = rows[0];
  let passwordMatches = false;
  try {
    passwordMatches = await argon2.verify(user.password_hash, password);
  } catch (error) {
    passwordMatches = false;
  }

  if (!passwordMatches) {
    return res.status(401).json({ mensaje: 'Credenciales incorrectas o cuenta desactivada.' });
  }

  const token = jwt.sign(
    { rol: user.rol },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: String(user.id_usuario),
      expiresIn: process.env.JWT_EXPIRES_IN || '30m',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    }
  );

  return res.json({
    mensaje: 'Inicio de sesion correcto.',
    token,
    tipo: 'Bearer',
    expiraEn: process.env.JWT_EXPIRES_IN || '30m',
    usuario: {
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol
    }
  });
}

function profile(req, res) {
  return res.json({ usuario: req.user });
}

function logout(req, res) {
  // JWT es stateless: el cliente elimina el token. El token deja de servir al expirar.
  return res.json({ mensaje: 'Sesion cerrada. Elimina el token almacenado en el cliente.' });
}

module.exports = { login, profile, logout };
