const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/** 雜湊密碼 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** 比對明文密碼與雜湊值是否相符 */
async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = { hashPassword, comparePassword };
