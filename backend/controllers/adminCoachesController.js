const { pool, query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const {
  isUndefined,
  isNotValidString,
  isNotValidInteger,
  isValidUUID,
  isValidHttpsUrl,
} = require('../utils/validators');

/** POST /api/admin/coaches/:userId（public，不需登入） */
async function promoteToCoach(req, res, next) {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    const {
      experience_years: experienceYears,
      description,
      profile_image_url: profileImageUrl,
    } = req.body;

    if (!isValidUUID(userId)) {
      return failResponse(res, 400, '使用者不存在');
    }
    if (
      isUndefined(experienceYears) || isNotValidInteger(experienceYears) ||
      isUndefined(description) || isNotValidString(description) ||
      (profileImageUrl && !isValidHttpsUrl(profileImageUrl))
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    const userResult = await client.query('SELECT id, name, role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return failResponse(res, 400, '使用者不存在');
    }
    if (userResult.rows[0].role === 'COACH') {
      return failResponse(res, 409, '使用者已經是教練');
    }

    await client.query('BEGIN');
    await client.query("UPDATE users SET role = 'COACH', updated_at = now() WHERE id = $1", [userId]);
    const coachResult = await client.query(
      `INSERT INTO coaches (user_id, experience_years, description, profile_image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, experience_years, description, profile_image_url, created_at, updated_at`,
      [userId, experienceYears, description, profileImageUrl || null]
    );
    await client.query('COMMIT');

    return successResponse(res, 201, {
      user: { name: userResult.rows[0].name, role: 'COACH' },
      coach: coachResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

/** 從 coach_skills 撈某教練目前的 skill_ids */
async function fetchSkillIds(coachId) {
  const result = await query('SELECT skill_id FROM coach_skills WHERE coach_id = $1', [coachId]);
  return result.rows.map((row) => row.skill_id);
}

/** GET /api/admin/coaches */
async function getMyCoachProfile(req, res, next) {
  try {
    const result = await query(
      'SELECT id, experience_years, description, profile_image_url FROM coaches WHERE user_id = $1',
      [req.user.id]
    );
    const coach = result.rows[0];
    const skillIds = await fetchSkillIds(coach.id);
    return successResponse(res, 200, { ...coach, skill_ids: skillIds });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/admin/coaches */
async function updateMyCoachProfile(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      experience_years: experienceYears,
      description,
      profile_image_url: profileImageUrl,
      skill_ids: skillIds,
    } = req.body;

    if (
      isUndefined(experienceYears) || isNotValidInteger(experienceYears) ||
      isUndefined(description) || isNotValidString(description) ||
      isUndefined(profileImageUrl) || !isValidHttpsUrl(profileImageUrl) ||
      !Array.isArray(skillIds) || skillIds.length === 0 || skillIds.some((id) => !isValidUUID(id))
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    await client.query('BEGIN');
    const updateResult = await client.query(
      `UPDATE coaches SET experience_years = $1, description = $2, profile_image_url = $3, updated_at = now()
       WHERE user_id = $4
       RETURNING id, experience_years, description, profile_image_url`,
      [experienceYears, description, profileImageUrl, req.user.id]
    );
    const coach = updateResult.rows[0];
    await client.query('DELETE FROM coach_skills WHERE coach_id = $1', [coach.id]);
    for (const skillId of skillIds) {
      await client.query('INSERT INTO coach_skills (coach_id, skill_id) VALUES ($1, $2)', [
        coach.id,
        skillId,
      ]);
    }
    await client.query('COMMIT');

    return successResponse(res, 200, { ...coach, skill_ids: skillIds });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

/** GET /api/admin/coaches/courses */
async function listMyCourses(req, res, next) {
  try {
    const result = await query(
      `SELECT
         c.id, c.name, c.start_at, c.end_at, c.max_participants, c.meeting_url,
         CASE
           WHEN now() < c.start_at THEN '尚未開始'
           WHEN now() >= c.start_at AND now() < c.end_at THEN '進行中'
           ELSE '已結束'
         END AS status,
         COUNT(b.id) FILTER (WHERE b.cancelled_at IS NULL)::int AS participants
       FROM courses c
       LEFT JOIN course_bookings b ON b.course_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.start_at ASC`,
      [req.user.id]
    );
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

/** POST /api/admin/coaches/courses */
async function createCourse(req, res, next) {
  try {
    const {
      skill_id: skillId,
      name,
      description,
      start_at: startAt,
      end_at: endAt,
      max_participants: maxParticipants,
      meeting_url: meetingUrl,
    } = req.body;

    if (
      isUndefined(skillId) || isNotValidString(skillId) || !isValidUUID(skillId) ||
      isUndefined(name) || isNotValidString(name) ||
      isUndefined(description) || isNotValidString(description) ||
      isUndefined(startAt) || isNotValidString(startAt) ||
      isUndefined(endAt) || isNotValidString(endAt) ||
      isUndefined(maxParticipants) || isNotValidInteger(maxParticipants) ||
      isUndefined(meetingUrl) || !isValidHttpsUrl(meetingUrl)
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    const skillResult = await query('SELECT id FROM skills WHERE id = $1', [skillId]);
    if (skillResult.rows.length === 0) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    const result = await query(
      `INSERT INTO courses (user_id, skill_id, name, description, start_at, end_at, max_participants, meeting_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, skill_id, name, description, start_at, end_at, max_participants, meeting_url, created_at, updated_at`,
      [req.user.id, skillId, name, description, startAt, endAt, maxParticipants, meetingUrl]
    );
    return successResponse(res, 201, { course: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/admin/coaches/courses/:courseId（owner-scoped） */
async function getMyCourseById(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!isValidUUID(courseId)) {
      return failResponse(res, 400, '課程不存在');
    }
    const result = await query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants, c.meeting_url,
              s.name AS skill_name, s.id AS skill_id
       FROM courses c
       JOIN skills s ON s.id = c.skill_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [courseId, req.user.id]
    );
    if (result.rows.length === 0) {
      return failResponse(res, 400, '課程不存在');
    }
    return successResponse(res, 200, result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/admin/coaches/courses/:courseId（owner-scoped，欄位驗證先做，擁有者檢查後做） */
async function updateMyCourse(req, res, next) {
  try {
    const { courseId } = req.params;
    const {
      skill_id: skillId,
      name,
      description,
      start_at: startAt,
      end_at: endAt,
      max_participants: maxParticipants,
      meeting_url: meetingUrl,
    } = req.body;

    if (
      isUndefined(skillId) || isNotValidString(skillId) || !isValidUUID(skillId) ||
      isUndefined(name) || isNotValidString(name) ||
      isUndefined(description) || isNotValidString(description) ||
      isUndefined(startAt) || isNotValidString(startAt) ||
      isUndefined(endAt) || isNotValidString(endAt) ||
      isUndefined(maxParticipants) || isNotValidInteger(maxParticipants) ||
      isUndefined(meetingUrl) || !isValidHttpsUrl(meetingUrl)
    ) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    const skillResult = await query('SELECT id FROM skills WHERE id = $1', [skillId]);
    if (skillResult.rows.length === 0) {
      return failResponse(res, 400, '欄位未填寫正確');
    }

    if (!isValidUUID(courseId)) {
      return failResponse(res, 400, '課程不存在');
    }

    const result = await query(
      `UPDATE courses SET
         skill_id = $1, name = $2, description = $3, start_at = $4, end_at = $5,
         max_participants = $6, meeting_url = $7, updated_at = now()
       WHERE id = $8 AND user_id = $9
       RETURNING id, user_id, skill_id, name, description, start_at, end_at, max_participants, meeting_url, created_at, updated_at`,
      [skillId, name, description, startAt, endAt, maxParticipants, meetingUrl, courseId, req.user.id]
    );
    if (result.rows.length === 0) {
      return failResponse(res, 400, '課程不存在');
    }
    return successResponse(res, 200, { course: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  promoteToCoach,
  getMyCoachProfile,
  updateMyCoachProfile,
  listMyCourses,
  createCourse,
  getMyCourseById,
  updateMyCourse,
};
