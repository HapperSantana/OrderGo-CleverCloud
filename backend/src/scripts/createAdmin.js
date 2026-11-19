require('dotenv').config();
const argon2 = require('argon2');
const { pool } = require('../config/db');

async function main() {
  const nombre = process.env.ADMIN_NAME;
  const correo = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!nombre || !correo || password.length < 10) {
    throw new Error('Configura ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD (minimo 10 caracteres) en .env.');
  }

  const [existing] = await pool.execute(`SELECT id_usuario FROM usuarios WHERE correo = ?`, [correo]);
  if (existing.length) {
    console.log(`Ya existe un usuario con el correo ${correo}. No se modifico.`);
    return;
  }

  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const [result] = await pool.execute(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
     VALUES (?, ?, ?, 'administrador', 1)`,
    [nombre, correo, hash]
  );
  console.log(`Administrador creado. ID: ${result.insertId}; correo: ${correo}`);
  console.log('Por seguridad, elimina ADMIN_PASSWORD del archivo .env despues de crear la cuenta.');
}

main()
  .catch((error) => {
    console.error('No se pudo crear el administrador:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
