const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isNotValidString, isValidUUID } = require('../utils/validators');

/** GET /api/coaches/skill */
async function listSkills(req, res, next) {
  try {
    const result = await query('SELECT id, name FROM skills ORDER BY created_at ASC');
    return successResponse(res, 200, result.rows);
  } catch (error) {
    return next(error);
  }
}

/** POST /api/coaches/skill */
async function createSkill(req, res, next) {
  try {
    const { name } = req.body;
    if (isNotValidString(name)) {
      return failResponse(res, 400, '欄位未填寫正確');
    }
    const dup = await query('SELECT id FROM skills WHERE name = $1', [name]);
    if (dup.rows.length > 0) {
      return failResponse(res, 409, '資料重複');
    }
    const result = await query(
      'INSERT INTO skills (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"',
      [name]
    );
    return successResponse(res, 200, result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/coaches/skill/:skillId */
async function deleteSkill(req, res, next) {
  try {
    const { skillId } = req.params;
    if (!isValidUUID(skillId)) {
      return failResponse(res, 400, 'ID錯誤');
    }
    const result = await query('DELETE FROM skills WHERE id = $1', [skillId]);
    if (result.rowCount === 0) {
      return failResponse(res, 400, 'ID錯誤');
    }
    return successResponse(res, 200, { affected: result.rowCount });
  } catch (error) {
    // 捕捉外鍵約束違反，若有課程參考此技能，無法刪除
    if (error.code === '23503') {
      return failResponse(res, 400, '此技能仍被課程使用，無法刪除');
    }
    return next(error);
  }
}

module.exports = { listSkills, createSkill, deleteSkill };
