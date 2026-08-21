const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * 取得教練月營收統計
 * GET /api/admin/coaches/revenue?month=
 */
async function getMonthlyRevenue(req, res, next) {
  try {
    const month = req.query.month;
    const monthIndex = MONTH_NAMES.indexOf(month);
    if (monthIndex === -1) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    const year = new Date().getFullYear();
    const rangeStart = new Date(Date.UTC(year, monthIndex, 1));
    const rangeEnd = new Date(Date.UTC(year, monthIndex + 1, 1));

    // 單堂均價：全部方案 Σprice ÷ Σcredit_amount，在 Node 端用浮點數計算，
    // 避免 SQL numeric 除法精度跟測試端 JS 計算對不起來。
    const priceResult = await query('SELECT price, credit_amount FROM credit_packages');
    let totalPrice = 0;
    let totalCredits = 0;
    for (const pkg of priceResult.rows) {
      totalPrice += Number(pkg.price);
      totalCredits += Number(pkg.credit_amount);
    }
    const perCreditPrice = totalCredits > 0 ? totalPrice / totalCredits : 0;

    const bookingResult = await query(
      `SELECT b.user_id
       FROM course_bookings b
       JOIN courses c ON c.id = b.course_id
       WHERE c.user_id = $1
         AND b.cancelled_at IS NULL
         AND b.created_at >= $2
         AND b.created_at < $3`,
      [req.user.id, rangeStart, rangeEnd]
    );

    const bookingCount = bookingResult.rows.length;
    const participants = new Set(bookingResult.rows.map((row) => row.user_id)).size;
    // floor 必須在乘完之後才做
    const revenue = Math.floor(bookingCount * perCreditPrice);

    return successResponse(res, 200, {
      total: { revenue, participants, course_count: bookingCount },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getMonthlyRevenue };
