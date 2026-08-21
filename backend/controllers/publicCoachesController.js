const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isValidUUID } = require('../utils/validators');

/**
 * 把查詢字串轉成非負整數，轉不出來回 null
 */
function toNonNegativeInt(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

/**
 * GET /api/coaches?per=&page=
 * 教練分頁列表
 */
async function listCoaches(req, res, next) {
  try {
    const per = toNonNegativeInt(req.query.per);
    const page = toNonNegativeInt(req.query.page);
    if (per === null || page === null) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    const offset = Math.max(0, page - 1) * per;
    const result = await query(
      `SELECT co.id, co.user_id, u.name
       FROM coaches co
       JOIN users u ON u.id = co.user_id
       ORDER BY co.created_at ASC
       LIMIT $1 OFFSET $2`,
      [per, offset]
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/coaches/:coachId
 * 教練詳情
 */
async function getCoachDetail(req, res, next) {
  try {
    const { coachId } = req.params;
    if (!isValidUUID(coachId)) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    const result = await query(
      `SELECT u.name, u.role,
              co.id, co.user_id, co.experience_years, co.description,
              co.profile_image_url, co.created_at, co.updated_at
       FROM coaches co
       JOIN users u ON u.id = co.user_id
       WHERE co.id = $1`,
      [coachId]
    );
    if (result.rows.length === 0) {
      return failResponse(res, 400, '找不到該教練');
    }
    const row = result.rows[0];
    const skillsResult = await query(
      `SELECT s.name FROM coach_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.coach_id = $1`,
      [coachId]
    );
    return successResponse(res, 200, {
      user: { name: row.name, role: row.role },
      coach: {
        id: row.id,
        user_id: row.user_id,
        experience_years: row.experience_years,
        description: row.description,
        profile_image_url: row.profile_image_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
        skills: skillsResult.rows.map((s) => s.name),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/coaches/:coachId/courses
 * 教練未結束課程列表（end_at > now()）
 */
async function listCoachCourses(req, res, next) {
  try {
    const { coachId } = req.params;
    if (!isValidUUID(coachId)) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    const coachResult = await query('SELECT id, user_id FROM coaches WHERE id = $1', [coachId]);
    if (coachResult.rows.length === 0) {
      return failResponse(res, 400, '找不到該教練');
    }
    const result = await query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants,
              u.name AS coach_name, s.name AS skill_name
       FROM courses c
       JOIN users u ON u.id = c.user_id
       JOIN skills s ON s.id = c.skill_id
       WHERE c.user_id = $1 AND c.end_at > now()
       ORDER BY c.start_at ASC`,
      [coachResult.rows[0].user_id]
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCoaches, getCoachDetail, listCoachCourses };
