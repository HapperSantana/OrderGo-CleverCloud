const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/http');

const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ mensaje: 'Se requiere un token Bearer para acceder.' });
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token invalido, vencido o no autorizado.' });
  }

  const userId = Number(claims.sub);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ mensaje: 'Token no valido.' });
  }

  // Se consulta la cuenta en cada solicitud protegida para detectar usuarios desactivados
  // y aplicar de inmediato cambios de rol, aunque el JWT anterior siga vigente.
  const [rows] = await pool.execute(
    `SELECT id_usuario, nombre, correo, rol, activo
       FROM usuarios WHERE id_usuario = ? LIMIT 1`,
    [userId]
  );

  if (!rows.length || !rows[0].activo) {
    return res.status(401).json({ mensaje: 'La cuenta no existe o se encuentra desactivada.' });
  }

  req.user = rows[0];
  next();
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta operacion.' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
