const jwt = require('jsonwebtoken');

/** 簽發 JWT，payload 固定含 { id, role }，exp 由 expiresIn 自動附加 */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_DAY,
  });
}

module.exports = { signToken };
