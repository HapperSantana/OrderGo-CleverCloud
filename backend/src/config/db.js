const mysql = require('mysql2/promise');

// Desarrollo local: variables DB_* del archivo .env.
// Clever Cloud: variables MYSQL_ADDON_* inyectadas al vincular el add-on MySQL.
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQL_ADDON_HOST,
  port: Number(process.env.DB_PORT || process.env.MYSQL_ADDON_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_ADDON_USER,
  password: process.env.DB_PASSWORD || process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.DB_NAME || process.env.MYSQL_ADDON_DB || 'ordergo',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true,
  timezone: 'Z'
});

async function checkDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = { pool, checkDatabase };
