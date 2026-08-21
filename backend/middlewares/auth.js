const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { failResponse } = require('../utils/response');

/**
 * 驗證 Authorization: Bearer <token>，成功則把使用者資訊掛在 req.user。
 * 401 三種訊息：請先登入／Token 已過期／無效的 token。
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return failResponse(res, 401, '請先登入');
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return failResponse(res, 401, '請先登入');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0) {
      return failResponse(res, 401, '無效的 token');
    }
    req.user = result.rows[0];
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return failResponse(res, 401, 'Token 已過期');
    }
    return failResponse(res, 401, '無效的 token');
  }
}

/** 必須是教練（role === 'COACH'）才能通過，需接在 verifyToken 之後使用 */
function requireCoach(req, res, next) {
  if (req.user.role !== 'COACH') {
    return failResponse(res, 401, '使用者尚未成為教練');
  }
  return next();
}

module.exports = { verifyToken, requireCoach };
