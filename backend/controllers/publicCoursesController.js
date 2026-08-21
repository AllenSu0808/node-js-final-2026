const { query } = require('../config/database');
const { successResponse } = require('../utils/response');

/**
 * GET /api/courses
 * 全站進行中課程列表（start_at <= now < end_at）
 */
async function listOngoingCourses(req, res, next) {
  try {
    const result = await query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants,
              u.name AS coach_name, s.name AS skill_name
       FROM courses c
       JOIN users u ON u.id = c.user_id
       JOIN skills s ON s.id = c.skill_id
       WHERE c.start_at <= now() AND now() < c.end_at
       ORDER BY c.start_at ASC`
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = { listOngoingCourses };
