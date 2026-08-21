/**
 * 共用欄位驗證函式。
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,16}$/;

/** 是否為 undefined */
const isUndefined = (value) => value === undefined;

/** 是否不是合法非空字串（trim 後不可為空） */
const isNotValidString = (value) =>
  typeof value !== 'string' || value.trim().length === 0;

/** 是否不是合法的 0 以上整數（型別必須是 number，不接受數字字串） */
const isNotValidInteger = (value) =>
  typeof value !== 'number' || !Number.isInteger(value) || value < 0;

/** 是否為合法 uuid 字串格式 */
const isValidUUID = (value) => typeof value === 'string' && UUID_REGEX.test(value);

/** 是否以 https 開頭 */
const isValidHttpsUrl = (value) => typeof value === 'string' && value.startsWith('https://');

/** 是否符合密碼規則：英文大小寫＋數字，8~16 字 */
const isValidPassword = (value) => typeof value === 'string' && PASSWORD_REGEX.test(value);

module.exports = {
  isUndefined,
  isNotValidString,
  isNotValidInteger,
  isValidUUID,
  isValidHttpsUrl,
  isValidPassword,
};
