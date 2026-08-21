const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_ENABLE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

/** 檢查資料庫連線是否正常 */
async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  checkConnection,
  query: (text, params) => pool.query(text, params),
};
