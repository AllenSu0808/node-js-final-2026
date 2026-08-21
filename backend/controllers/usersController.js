const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isUndefined, isNotValidString, isValidPassword } = require('../utils/validators');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

const PASSWORD_RULE_MESSAGE =
  '密碼不符合規則，需要包含英文數字大小寫，最短8個字，最長16個字';

/** POST /api/users/signup */
async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (
      isUndefined(name) || isNotValidString(name) ||
      isUndefined(email) || isNotValidString(email) ||
      isUndefined(password) || isNotValidString(password)
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    if (!isValidPassword(password)) {
      return failResponse(res, 400, PASSWORD_RULE_MESSAGE);
    }
    const dup = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (dup.rows.length > 0) {
      return failResponse(res, 409, 'Email 已被使用');
    }
    const hashed = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'USER')
       RETURNING id, name`,
      [name, email, hashed]
    );
    return successResponse(res, 201, { user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

/** POST /api/users/login */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (
      isUndefined(email) || isNotValidString(email) ||
      isUndefined(password) || isNotValidString(password)
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    if (!isValidPassword(password)) {
      return failResponse(res, 400, PASSWORD_RULE_MESSAGE);
    }
    const result = await query('SELECT id, name, role, password FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return failResponse(res, 400, '使用者不存在或密碼輸入錯誤');
    }
    const user = result.rows[0];
    const matched = await comparePassword(password, user.password);
    if (!matched) {
      return failResponse(res, 400, '使用者不存在或密碼輸入錯誤');
    }
    const token = signToken({ id: user.id, role: user.role });
    return successResponse(res, 201, { token, user: { name: user.name } });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/users/profile */
async function getProfile(req, res, next) {
  try {
    return successResponse(res, 200, {
      user: { name: req.user.name, email: req.user.email },
    });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/users/profile */
async function updateProfile(req, res, next) {
  try {
    const { name } = req.body;
    if (isUndefined(name) || isNotValidString(name)) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    if (name === req.user.name) {
      return failResponse(res, 400, '使用者名稱未變更');
    }
    const result = await query(
      'UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING name',
      [name, req.user.id]
    );
    if (result.rows.length === 0) {
      return failResponse(res, 400, '更新使用者資料失敗');
    }
    return successResponse(res, 200, { user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/users/password */
async function updatePassword(req, res, next) {
  try {
    const {
      password,
      new_password: newPassword,
      confirm_new_password: confirmNewPassword,
    } = req.body;
    if (
      isUndefined(password) || isNotValidString(password) ||
      isUndefined(newPassword) || isNotValidString(newPassword) ||
      isUndefined(confirmNewPassword) || isNotValidString(confirmNewPassword)
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    if (
      !isValidPassword(password) ||
      !isValidPassword(newPassword) ||
      !isValidPassword(confirmNewPassword)
    ) {
      return failResponse(res, 400, PASSWORD_RULE_MESSAGE);
    }
    if (newPassword === password) {
      return failResponse(res, 400, '新密碼不能與舊密碼相同');
    }
    if (newPassword !== confirmNewPassword) {
      return failResponse(res, 400, '新密碼與驗證新密碼不一致');
    }
    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const matched = await comparePassword(password, result.rows[0].password);
    if (!matched) {
      return failResponse(res, 400, '密碼輸入錯誤');
    }
    const hashed = await hashPassword(newPassword);
    await query('UPDATE users SET password = $1, updated_at = now() WHERE id = $2', [
      hashed,
      req.user.id,
    ]);
    return successResponse(res, 200, null);
  } catch (error) {
    return next(error);
  }
}

/** GET /api/users/credit-package */
async function listMyCreditPackages(req, res, next) {
  try {
    const result = await query(
      `SELECT cp.name, p.purchased_credits, p.price_paid::float AS price_paid, p.purchase_at
       FROM credit_purchases p
       JOIN credit_packages cp ON cp.id = p.credit_package_id
       WHERE p.user_id = $1
       ORDER BY p.purchase_at DESC`,
      [req.user.id]
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

/** GET /api/users/courses */
async function getMyCourses(req, res, next) {
  try {
    const creditResult = await query(
      'SELECT COALESCE(SUM(purchased_credits), 0) AS total_purchased FROM credit_purchases WHERE user_id = $1',
      [req.user.id]
    );
    const usageResult = await query(
      'SELECT COUNT(*) AS used FROM course_bookings WHERE user_id = $1 AND cancelled_at IS NULL',
      [req.user.id]
    );
    const totalPurchased = Number(creditResult.rows[0].total_purchased);
    const creditUsage = Number(usageResult.rows[0].used);

    const bookingsResult = await query(
      `SELECT b.course_id, c.name, c.start_at, c.end_at, c.meeting_url, u.name AS coach_name, b.cancelled_at
       FROM course_bookings b
       JOIN courses c ON c.id = b.course_id
       JOIN users u ON u.id = c.user_id
       WHERE b.user_id = $1
       ORDER BY c.start_at ASC`,
      [req.user.id]
    );

    return successResponse(res, 200, {
      credit_remain: totalPurchased - creditUsage,
      credit_usage: creditUsage,
      course_booking: bookingsResult.rows,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { signup, login, getProfile, updateProfile, updatePassword, listMyCreditPackages, getMyCourses };
