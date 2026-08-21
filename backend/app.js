const express = require('express');
const cors = require('cors');

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'failed', message: '伺服器錯誤' });
});

module.exports = app;
