const express = require('express');
const cors = require('cors');
const db = require('./config/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康檢查 endpoint
app.get('/healthcheck', async (req, res) => {
  try {
    // 檢查資料庫連線
    await db.checkConnection();
    res.status(200).json({
      status: 'success',
      message: '後端服務正常運行'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'failed',
      message: '資料庫連線失敗'
    });
  }
});

// 路由
app.use('/api', require('./routes'));

// 錯誤處理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    status: 'failed',
    message: '伺服器錯誤'
  });
});

module.exports = app;
