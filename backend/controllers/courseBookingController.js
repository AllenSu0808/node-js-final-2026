const { pool, query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isValidUUID } = require('../utils/validators');

/** POST /api/courses/:courseId（報名，檢查順序：課程存在→未報名過(含已取消)→剩餘堂數→名額） */
async function bookCourse(req, res, next) {
  const client = await pool.connect();
  try {
    const { courseId } = req.params;
    if (!isValidUUID(courseId)) {
      return failResponse(res, 400, 'ID錯誤');
    }

    await client.query('BEGIN');

    const courseResult = await client.query(
      'SELECT id, max_participants FROM courses WHERE id = $1 FOR UPDATE',
      [courseId]
    );
    if (courseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return failResponse(res, 400, 'ID錯誤');
    }
    const course = courseResult.rows[0];

    const existingBooking = await client.query(
      'SELECT id FROM course_bookings WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    if (existingBooking.rows.length > 0) {
      await client.query('ROLLBACK');
      return failResponse(res, 400, '已經報名過此課程');
    }

    const creditResult = await client.query(
      'SELECT COALESCE(SUM(purchased_credits), 0) AS total FROM credit_purchases WHERE user_id = $1',
      [req.user.id]
    );
    const usageResult = await client.query(
      'SELECT COUNT(*) AS used FROM course_bookings WHERE user_id = $1 AND cancelled_at IS NULL',
      [req.user.id]
    );
    const creditRemain = Number(creditResult.rows[0].total) - Number(usageResult.rows[0].used);
    if (creditRemain <= 0) {
      await client.query('ROLLBACK');
      return failResponse(res, 400, '已無可使用堂數');
    }

    const participantsResult = await client.query(
      'SELECT COUNT(*) AS count FROM course_bookings WHERE course_id = $1 AND cancelled_at IS NULL',
      [courseId]
    );
    if (Number(participantsResult.rows[0].count) >= course.max_participants) {
      await client.query('ROLLBACK');
      return failResponse(res, 400, '已達最大參加人數，無法參加');
    }

    await client.query('INSERT INTO course_bookings (user_id, course_id) VALUES ($1, $2)', [
      req.user.id,
      courseId,
    ]);
    await client.query('COMMIT');
    return successResponse(res, 201, null);
  } catch (error) {
    await client.query('ROLLBACK');
    // 兜底：極端競速下 DB 的 UNIQUE(user_id, course_id) 約束被打到，轉成規格要求的訊息而不是 500
    if (error.code === '23505') {
      return failResponse(res, 400, '已經報名過此課程');
    }
    return next(error);
  } finally {
    client.release();
  }
}

/** DELETE /api/courses/:courseId（取消報名，軟刪除） */
async function cancelBooking(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!isValidUUID(courseId)) {
      return failResponse(res, 400, 'ID錯誤');
    }
    const result = await query(
      `UPDATE course_bookings SET cancelled_at = now()
       WHERE user_id = $1 AND course_id = $2 AND cancelled_at IS NULL
       RETURNING id`,
      [req.user.id, courseId]
    );
    if (result.rows.length === 0) {
      return failResponse(res, 400, 'ID錯誤');
    }
    return successResponse(res, 200, null);
  } catch (error) {
    return next(error);
  }
}

module.exports = { bookCourse, cancelBooking };
