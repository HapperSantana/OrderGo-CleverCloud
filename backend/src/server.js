require('dotenv').config();
const app = require('./app');
const { checkDatabase } = require('./config/db');

async function start() {
  const required = ['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE'];
  const missing = required.filter((key) => !process.env[key]);
  const dbHost = process.env.DB_HOST || process.env.MYSQL_ADDON_HOST;
  const dbUser = process.env.DB_USER || process.env.MYSQL_ADDON_USER;
  const dbName = process.env.DB_NAME || process.env.MYSQL_ADDON_DB;
  const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_ADDON_PASSWORD;
  if (!dbHost) missing.push('DB_HOST o MYSQL_ADDON_HOST');
  if (!dbUser) missing.push('DB_USER o MYSQL_ADDON_USER');
  if (!dbName) missing.push('DB_NAME o MYSQL_ADDON_DB');
  if (!dbPassword) missing.push('DB_PASSWORD o MYSQL_ADDON_PASSWORD');
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Revisa la configuracion de la aplicacion y del add-on MySQL.`);
  }
  if (process.env.JWT_SECRET.length < 48) {
    throw new Error('JWT_SECRET debe tener al menos 48 caracteres aleatorios.');
  }

  await checkDatabase();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`OrderGo escuchando en 0.0.0.0:${port}`);
    console.log(`API health: /api/health`);
  });
}

start().catch((error) => {
  console.error('No fue posible iniciar OrderGo:', error.message);
  process.exit(1);
});
