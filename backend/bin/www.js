require('dotenv').config();
const app = require('../app');
const { checkConnection } = require('../config/database');
const { ensureSchema } = require('../db/schema');

const PORT = process.env.PORT || 8080;

/** 等待資料庫連線就緒（容器啟動時 postgres 可能還沒完全 ready，重試最多 10 次） */
async function waitForDatabase(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await checkConnection();
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function start() {
  await waitForDatabase();
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`後端伺服器運行於 http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('後端啟動失敗:', error);
  process.exit(1);
});
