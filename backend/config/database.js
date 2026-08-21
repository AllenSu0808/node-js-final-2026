const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
});

// 檢查資料庫連線
const checkConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
  } finally {
    client.release();
  }
};

// 初始化資料庫表格
const initializeDatabase = async () => {
  try {
    // 等待資料庫連線就緒
    await checkConnection();
    console.log('資料庫連線成功');

    // 建立表格邏輯將在這裡新增
    // TODO: 根據 M1-M6 任務需求建立各個表格
  } catch (error) {
    console.error('資料庫初始化失敗:', error);
    throw error;
  }
};

// 啟動時初始化
initializeDatabase().catch(err => {
  console.error('無法連接到資料庫:', err);
  process.exit(1);
});

module.exports = {
  pool,
  checkConnection,
  query: (text, params) => pool.query(text, params),
};
