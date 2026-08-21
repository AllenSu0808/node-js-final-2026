const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isNotValidString, isNotValidInteger, isValidUUID } = require('../utils/validators');

/** GET /api/credit-package */
async function listCreditPackages(req, res, next) {
  try {
    const result = await query(
      'SELECT id, name, credit_amount, price FROM credit_packages ORDER BY created_at ASC'
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

/** POST /api/credit-package */
async function createCreditPackage(req, res, next) {
  try {
    const { name, credit_amount: creditAmount, price } = req.body;
    if (isNotValidString(name) || isNotValidInteger(creditAmount) || isNotValidInteger(price)) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    const dup = await query('SELECT id FROM credit_packages WHERE name = $1', [name]);
    if (dup.rows.length > 0) {
      return failResponse(res, 409, '資料重複');
    }
    const result = await query(
      `INSERT INTO credit_packages (name, credit_amount, price)
       VALUES ($1, $2, $3)
       RETURNING id, name, credit_amount, price, created_at AS "createdAt"`,
      [name, creditAmount, price]
    );
    return successResponse(res, 200, result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/credit-package/:creditPackageId */
async function deleteCreditPackage(req, res, next) {
  try {
    const { creditPackageId } = req.params;
    if (!isValidUUID(creditPackageId)) {
      return failResponse(res, 400, 'ID錯誤');
    }
    const result = await query('DELETE FROM credit_packages WHERE id = $1', [creditPackageId]);
    if (result.rowCount === 0) {
      return failResponse(res, 400, 'ID錯誤');
    }
    return successResponse(res, 200, { affected: result.rowCount });
  } catch (error) {
    // 捕捉外鍵約束違反，若有購買紀錄參考此方案，無法刪除
    if (error.code === '23503') {
      return failResponse(res, 400, '此方案已有人購買，無法刪除');
    }
    return next(error);
  }
}

/** POST /api/credit-package/:creditPackageId（需登入） */
async function buyCreditPackage(req, res, next) {
  try {
    const { creditPackageId } = req.params;
    if (!isValidUUID(creditPackageId)) {
      return failResponse(res, 400, 'ID錯誤');
    }
    const pkgResult = await query(
      'SELECT id, credit_amount, price FROM credit_packages WHERE id = $1',
      [creditPackageId]
    );
    if (pkgResult.rows.length === 0) {
      return failResponse(res, 400, 'ID錯誤');
    }
    const pkg = pkgResult.rows[0];
    await query(
      `INSERT INTO credit_purchases (user_id, credit_package_id, purchased_credits, price_paid)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, creditPackageId, pkg.credit_amount, pkg.price]
    );
    return successResponse(res, 200, null);
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCreditPackages, createCreditPackage, deleteCreditPackage, buyCreditPackage };
