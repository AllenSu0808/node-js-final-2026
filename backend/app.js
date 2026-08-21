const express = require('express');
const cors = require('cors');
const { failResponse } = require('./utils/response');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康檢查：純文字 OK，不套 { status, data } 包裝。
// 進入點（bin/www.js）已確保資料庫連線與建表完成才會呼叫 app.listen，
// 所以只要伺服器在監聽，就代表資料庫已就緒。
app.get('/healthcheck', (req, res) => {
  res.status(200).type('text/plain').send('OK');
});

app.use('/api', require('./routes'));

// 404：所有路由都比對不到時才會走到這裡，統一回傳 JSON 格式，避免前端收到 Express 預設的 HTML 錯誤頁。
app.use((req, res) => {
  failResponse(res, 404, '找不到該路由');
});

// 全域錯誤處理 middleware：集中攔截路由與其他 middleware 拋出的例外，統一錯誤回應格式並記錄 log，方便後續追查。
app.use((err, req, res, next) => {
  console.error(err);
  failResponse(res, 500, '伺服器錯誤');
});

module.exports = app;
