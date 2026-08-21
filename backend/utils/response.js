/**
 * 統一 API 回應格式工具。
 */

/** 回傳成功格式：{ status: 'success', data } */
function successResponse(res, statusCode, data = null) {
  return res.status(statusCode).json({ status: 'success', data });
}

/** 回傳失敗格式：{ status: 'failed', message } */
function failResponse(res, statusCode, message) {
  return res.status(statusCode).json({ status: 'failed', message });
}

module.exports = { successResponse, failResponse };
