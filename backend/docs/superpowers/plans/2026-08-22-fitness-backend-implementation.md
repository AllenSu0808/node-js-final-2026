# 健身房後端建置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **執行方式建議：本計畫建議用 Inline Execution（executing-plans）而非 fresh subagent per task。** 理由：8 個任務高度共用同一組 middleware／utils／DB schema／dev server（nodemon 背景執行、資料庫連線），且錯誤訊息文字需要在全部端點間保持逐字一致；同一個持續 session 比每個任務重新 cold-start 的 subagent 更有效率、更不容易出現不一致。

**Goal:** 從零建置 `backend/`，實作 README 主線任務 M0～M6 全部 API 與壓軸容器化，通過 `npm test`（68 支黑箱合約測試）與 `npm run test:smoke`。

**Architecture:** Express 5 + 原生 `pg`（無 ORM）。routes → controllers 兩層，controllers 內直接寫參數化 SQL。共用 middleware（JWT 驗證／教練身分檢查）與 utils（驗證函式、密碼雜湊、回應格式）。資料表在啟動時以 `CREATE TABLE IF NOT EXISTS` 自動建立。

**Tech Stack:** Express 5、pg、bcryptjs、jsonwebtoken、PostgreSQL 16（pgcrypto 擴充套件產生 UUID）。

**Spec:** `backend/docs/superpowers/specs/2026-08-22-fitness-backend-design.md`（架構決策）＋ `docs/openapi.yaml`（權威 API 規格，逐欄位以此為準）＋ `test/m1.test.js` ~ `test/m6.test.js`、`test/smoke.test.js`（黑箱驗收合約，不可修改）。

## Global Constraints

- PORT 固定 `8080`，不可更動（前端與 Swagger 寫死這個 port）。
- JWT payload 必須含 `{ id, role, exp }`。
- 四句固定錯誤訊息文字，一字不能改：`已經報名過此課程`／`已無可使用堂數`／`已達最大參加人數，無法參加`／`請先登入`。
- 所有 id 皆為 uuid 字串。
- 日期時間欄位一律 UTC ISO 8601 字串（Postgres `timestamptz` 經 Node `Date` → `res.json()` 自動序列化即符合此格式，不需手動格式化）。
- 統一回應格式：成功 `{ status: 'success', data }`；可預期失敗 `{ status: 'failed', message }`。
- 環境變數命名比照根目錄 `.env.example`，一律從 `process.env` 讀取，不可寫死在程式碼裡。
- 不修改 `frontend/`、根目錄 `docs/`、`test/`、`.github/`、根目錄 `package.json`／`package-lock.json`。所有新增/修改都在 `backend/` 底下（`docker-compose.yml` 例外，壓軸容器化任務需要）。
- `GET /healthcheck` 回**純文字** `OK`，不是 JSON，且不在 `/api` 底下。

---

### Task 1: 專案骨架 + M0 修正 + M1 種資料（技能／方案）

**Files:**
- Modify: `backend/package.json`（新增 `bcryptjs`、`jsonwebtoken` 依賴）
- Modify: `backend/.gitignore`（移除排除 `package-lock.json` 的那行，讓 lock 檔可以被提交）
- Modify: `backend/config/database.js`（移除模組載入時自動執行的 IIFE，加上 `DB_ENABLE_SSL` 支援）
- Modify: `backend/app.js`（`/healthcheck` 改回純文字 `OK`，掛載 `/api` 路由，移除舊的 db 依賴）
- Modify: `backend/bin/www.js`（先等資料庫就緒＋建表完成才 `app.listen`）
- Create: `backend/db/schema.js`（8 張表的建表 SQL）
- Create: `backend/utils/response.js`
- Create: `backend/utils/validators.js`
- Create: `backend/utils/password.js`
- Create: `backend/utils/jwt.js`
- Create: `backend/middlewares/auth.js`
- Create: `backend/controllers/skillsController.js`
- Create: `backend/controllers/creditPackagesController.js`
- Create: `backend/routes/coaches.js`（目前只放 M1 技能路由，M4 會在 Task 4 補上公開教練路由）
- Create: `backend/routes/creditPackage.js`
- Modify: `backend/routes/index.js`（掛載 `/coaches`、`/credit-package`）
- Test: `test/m1.test.js`（含 M0 healthcheck 一起測）

**Interfaces:**
- Produces：
  - `utils/response.js` → `successResponse(res, statusCode, data)`、`failResponse(res, statusCode, message)`
  - `utils/validators.js` → `isUndefined(value)`、`isNotValidString(value)`、`isNotValidInteger(value)`、`isValidUUID(value)`、`isValidHttpsUrl(value)`、`isValidPassword(value)`
  - `utils/password.js` → `hashPassword(plain): Promise<string>`、`comparePassword(plain, hashed): Promise<boolean>`
  - `utils/jwt.js` → `signToken(payload): string`
  - `middlewares/auth.js` → `verifyToken(req,res,next)`（成功後 `req.user = { id, name, email, role }`）、`requireCoach(req,res,next)`
  - `config/database.js` → `pool`（pg Pool 實例，供需要交易的 controller 用）、`query(text, params)`、`checkConnection()`
  - `db/schema.js` → `ensureSchema(): Promise<void>`
- 後續所有 Task 都依賴這些共用模組，介面簽名不可再變動。

- [ ] **Step 1: 安裝新依賴**

```bash
cd backend && npm install bcryptjs jsonwebtoken
```

- [ ] **Step 2: 修正 `backend/.gitignore`，允許提交 `package-lock.json`**

把這一行整行刪掉：
```
package-lock.json
```

- [ ] **Step 3: 建立 `backend/utils/response.js`**

```js
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
```

- [ ] **Step 4: 建立 `backend/utils/validators.js`**

```js
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
```

- [ ] **Step 5: 建立 `backend/utils/password.js`**

```js
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/** 雜湊密碼 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** 比對明文密碼與雜湊值是否相符 */
async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = { hashPassword, comparePassword };
```

- [ ] **Step 6: 建立 `backend/utils/jwt.js`**

```js
const jwt = require('jsonwebtoken');

/** 簽發 JWT，payload 固定含 { id, role }，exp 由 expiresIn 自動附加 */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_DAY,
  });
}

module.exports = { signToken };
```

- [ ] **Step 7: 建立 `backend/middlewares/auth.js`**

```js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { failResponse } = require('../utils/response');

/**
 * 驗證 Authorization: Bearer <token>，成功則把使用者資訊掛在 req.user。
 * 401 三種訊息：請先登入／Token 已過期／無效的 token。
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return failResponse(res, 401, '請先登入');
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return failResponse(res, 401, '請先登入');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0) {
      return failResponse(res, 401, '無效的 token');
    }
    req.user = result.rows[0];
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return failResponse(res, 401, 'Token 已過期');
    }
    return failResponse(res, 401, '無效的 token');
  }
}

/** 必須是教練（role === 'COACH'）才能通過，需接在 verifyToken 之後使用 */
function requireCoach(req, res, next) {
  if (req.user.role !== 'COACH') {
    return failResponse(res, 401, '使用者尚未成為教練');
  }
  return next();
}

module.exports = { verifyToken, requireCoach };
```

- [ ] **Step 8: 建立 `backend/db/schema.js`**

```js
const { query } = require('../config/database');

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','COACH')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    credit_amount INTEGER NOT NULL CHECK (credit_amount >= 0),
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    experience_years INTEGER NOT NULL CHECK (experience_years >= 0),
    description TEXT NOT NULL,
    profile_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS coach_skills (
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (coach_id, skill_id)
  );`,
  `CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    skill_id UUID NOT NULL REFERENCES skills(id),
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    max_participants INTEGER NOT NULL CHECK (max_participants >= 0),
    meeting_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    credit_package_id UUID NOT NULL REFERENCES credit_packages(id),
    purchased_credits INTEGER NOT NULL,
    price_paid NUMERIC(10,2) NOT NULL,
    purchase_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS course_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    UNIQUE (user_id, course_id)
  );`,
];

/** 依序建立所有資料表（IF NOT EXISTS，可重複執行） */
async function ensureSchema() {
  for (const statement of STATEMENTS) {
    await query(statement);
  }
}

module.exports = { ensureSchema };
```

- [ ] **Step 9: 改寫 `backend/config/database.js`（移除自動執行的 IIFE，加上 SSL 支援）**

```js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_ENABLE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

/** 檢查資料庫連線是否正常 */
async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  checkConnection,
  query: (text, params) => pool.query(text, params),
};
```

- [ ] **Step 10: 改寫 `backend/bin/www.js`（等資料庫就緒＋建表完成才 listen）**

```js
require('dotenv').config();
const app = require('../app');
const { checkConnection } = require('../config/database');
const { ensureSchema } = require('../db/schema');

const PORT = process.env.PORT || 8080;

/** 等待資料庫連線就緒（容器啟動時 postgres 可能還沒完全 ready，重試最多 10 次） */
async function waitForDatabase(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await checkConnection();
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function start() {
  await waitForDatabase();
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`後端伺服器運行於 http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('後端啟動失敗:', error);
  process.exit(1);
});
```

- [ ] **Step 11: 改寫 `backend/app.js`（healthcheck 改純文字，掛載 /api）**

```js
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康檢查：純文字 OK，不套 { status, data } 包裝。
// 進入點（bin/www.js）已確保資料庫連線與建表完成才會呼叫 app.listen，
// 所以只要伺服器在監聽，就代表資料庫已就緒。
app.get('/healthcheck', (req, res) => {
  res.status(200).type('text/plain').send('OK');
});

app.use('/api', require('./routes'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'failed', message: '伺服器錯誤' });
});

module.exports = app;
```

- [ ] **Step 12: 建立 `backend/controllers/skillsController.js`**

```js
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
    return next(error);
  }
}

module.exports = { listSkills, createSkill, deleteSkill };
```

- [ ] **Step 13: 建立 `backend/controllers/creditPackagesController.js`**

```js
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
    return next(error);
  }
}

module.exports = { listCreditPackages, createCreditPackage, deleteCreditPackage };
```

- [ ] **Step 14: 建立 `backend/routes/coaches.js`（目前只放技能路由）**

```js
const express = require('express');
const router = express.Router();
const skillsController = require('../controllers/skillsController');

// M1：技能路由必須放在最前面，避免之後 M4 的 GET /:coachId 把 "skill" 當成 coachId 攔截掉
router.get('/skill', skillsController.listSkills);
router.post('/skill', skillsController.createSkill);
router.delete('/skill/:skillId', skillsController.deleteSkill);

module.exports = router;
```

- [ ] **Step 15: 建立 `backend/routes/creditPackage.js`**

```js
const express = require('express');
const router = express.Router();
const creditPackagesController = require('../controllers/creditPackagesController');

router.get('/', creditPackagesController.listCreditPackages);
router.post('/', creditPackagesController.createCreditPackage);
router.delete('/:creditPackageId', creditPackagesController.deleteCreditPackage);

module.exports = router;
```

- [ ] **Step 16: 改寫 `backend/routes/index.js`**

```js
const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));

module.exports = router;
```

- [ ] **Step 17: 啟動後端（背景執行，之後任務都沿用這個 process，nodemon 存檔自動重啟）**

```bash
cd backend && npm run dev > /tmp/backend-dev.log 2>&1 &
```

等待就緒：
```bash
for i in $(seq 1 15); do curl -sf http://localhost:8080/healthcheck && break; sleep 1; done
```
Expected：印出 `OK`

- [ ] **Step 18: 執行 M1 測試（含 M0 healthcheck）**

Run（於專案根目錄）: `npm run test:m1`
Expected: PASS（全部綠燈）

- [ ] **Step 19: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
建置後端骨架並完成 M0 健康檢查與 M1 種資料 API（技能／方案）
--- feat ---
1. 建立 8 張資料表 schema，啟動時自動建立
2. 實作 JWT 驗證與教練身分檢查 middleware
3. 實作技能與購買方案的新增／查詢／刪除 API
--- fix ---
1. 修正 /healthcheck 回應格式為純文字 OK
--- chore ---
1. 新增 bcryptjs、jsonwebtoken 依賴，允許提交 package-lock.json
EOF
)"
```

---

### Task 2: M2 會員系統

**Files:**
- Create: `backend/controllers/usersController.js`
- Create: `backend/routes/users.js`
- Modify: `backend/routes/index.js`（掛載 `/users`）
- Test: `test/m2.test.js`

**Interfaces:**
- Consumes：Task 1 的 `utils/response.js`、`utils/validators.js`、`utils/password.js`、`utils/jwt.js`、`middlewares/auth.js`（`verifyToken`）。
- Produces：`usersController.{signup, login, getProfile, updateProfile, updatePassword}`，後續 Task 5 會再擴充這個檔案。

- [ ] **Step 1: 建立 `backend/controllers/usersController.js`**

```js
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

module.exports = { signup, login, getProfile, updateProfile, updatePassword };
```

- [ ] **Step 2: 建立 `backend/routes/users.js`**

```js
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { verifyToken } = require('../middlewares/auth');

router.post('/signup', usersController.signup);
router.post('/login', usersController.login);
router.get('/profile', verifyToken, usersController.getProfile);
router.put('/profile', verifyToken, usersController.updateProfile);
router.put('/password', verifyToken, usersController.updatePassword);

module.exports = router;
```

- [ ] **Step 3: 修改 `backend/routes/index.js`，掛載 `/users`**

```js
const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));
router.use('/users', require('./users'));

module.exports = router;
```

- [ ] **Step 4: 執行 M2 測試**

Run（於專案根目錄）: `npm run test:m2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
實作 M2 會員系統：註冊、登入、個人資料與密碼修改
--- feat ---
1. 新增會員註冊與登入 API，登入簽發含 id/role/exp 的 JWT
2. 新增查看與修改個人資料 API
3. 新增修改密碼 API，依序檢查欄位、規則、新舊相同、確認一致、舊密碼正確
EOF
)"
```

---

### Task 3: M3 教練後台（升級教練、教練資料、課程 CRUD）

**Files:**
- Create: `backend/controllers/adminCoachesController.js`
- Create: `backend/routes/adminCoaches.js`
- Modify: `backend/routes/index.js`（掛載 `/admin/coaches`）
- Test: `test/m3.test.js`

**Interfaces:**
- Consumes：`utils/response.js`、`utils/validators.js`、`middlewares/auth.js`（`verifyToken`、`requireCoach`）、`config/database.js`（`pool`、`query`）。
- Produces：`adminCoachesController.{promoteToCoach, getMyCoachProfile, updateMyCoachProfile, listMyCourses, createCourse, getMyCourseById, updateMyCourse}`。Task 6（M6）會在同一個路由檔案再掛一支 `/revenue`。

- [ ] **Step 1: 建立 `backend/controllers/adminCoachesController.js`**

```js
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
      isUndefined(skillId) || isNotValidString(skillId) ||
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
      isUndefined(skillId) || isNotValidString(skillId) ||
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
```

- [ ] **Step 2: 建立 `backend/routes/adminCoaches.js`**

```js
const express = require('express');
const router = express.Router();
const adminCoachesController = require('../controllers/adminCoachesController');
const { verifyToken, requireCoach } = require('../middlewares/auth');

// 順序地雷：/courses 系列必須放在 /:userId 之前，
// 否則 POST /courses 會被 /:userId 攔截（把字串 "courses" 當成 userId）
router.get('/courses', verifyToken, requireCoach, adminCoachesController.listMyCourses);
router.post('/courses', verifyToken, requireCoach, adminCoachesController.createCourse);
router.get('/courses/:courseId', verifyToken, adminCoachesController.getMyCourseById);
router.put('/courses/:courseId', verifyToken, adminCoachesController.updateMyCourse);

router.get('/', verifyToken, requireCoach, adminCoachesController.getMyCoachProfile);
router.put('/', verifyToken, requireCoach, adminCoachesController.updateMyCoachProfile);

router.post('/:userId', adminCoachesController.promoteToCoach);

module.exports = router;
```

- [ ] **Step 3: 修改 `backend/routes/index.js`，掛載 `/admin/coaches`**

```js
const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));
router.use('/users', require('./users'));
router.use('/admin/coaches', require('./adminCoaches'));

module.exports = router;
```

- [ ] **Step 4: 執行 M3 測試**

Run（於專案根目錄）: `npm run test:m3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
實作 M3 教練後台：升級教練、教練資料維護與課程管理
--- feat ---
1. 新增升級教練 API，同一人不可重複升級
2. 新增教練個人資料查詢與更新（含技能整批覆蓋）
3. 新增課程開設、owner-scoped 單筆查詢與更新、教練課程列表
EOF
)"
```

---

### Task 4: M4 公開瀏覽

**Files:**
- Create: `backend/controllers/publicCoachesController.js`
- Create: `backend/controllers/publicCoursesController.js`
- Modify: `backend/routes/coaches.js`（在技能路由之後補上公開教練路由）
- Create: `backend/routes/courses.js`
- Modify: `backend/routes/index.js`（掛載 `/courses`）
- Test: `test/m4.test.js`

**Interfaces:**
- Consumes：`utils/response.js`、`utils/validators.js`（`isValidUUID`）、`config/database.js`（`query`）。
- Produces：`publicCoachesController.{listCoaches, getCoachDetail, listCoachCourses}`、`publicCoursesController.{listOngoingCourses}`。Task 5 會在 `routes/courses.js` 加上 booking 路由。

- [ ] **Step 1: 建立 `backend/controllers/publicCoachesController.js`**

```js
const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');
const { isValidUUID } = require('../utils/validators');

/** 把查詢字串轉成非負整數，轉不出來回 null */
function toNonNegativeInt(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

/** GET /api/coaches?per=&page= */
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

/** GET /api/coaches/:coachId */
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

/** GET /api/coaches/:coachId/courses（未結束：end_at > now） */
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
```

- [ ] **Step 2: 建立 `backend/controllers/publicCoursesController.js`**

```js
const { query } = require('../config/database');
const { successResponse } = require('../utils/response');

/** GET /api/courses（進行中：start_at <= now < end_at） */
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
```

- [ ] **Step 3: 修改 `backend/routes/coaches.js`，在技能路由之後補上公開教練路由**

```js
const express = require('express');
const router = express.Router();
const skillsController = require('../controllers/skillsController');
const publicCoachesController = require('../controllers/publicCoachesController');

// M1：技能路由必須放在最前面，避免被下面 /:coachId 攔截
router.get('/skill', skillsController.listSkills);
router.post('/skill', skillsController.createSkill);
router.delete('/skill/:skillId', skillsController.deleteSkill);

// M4：公開教練瀏覽
router.get('/', publicCoachesController.listCoaches);
router.get('/:coachId', publicCoachesController.getCoachDetail);
router.get('/:coachId/courses', publicCoachesController.listCoachCourses);

module.exports = router;
```

- [ ] **Step 4: 建立 `backend/routes/courses.js`**

```js
const express = require('express');
const router = express.Router();
const publicCoursesController = require('../controllers/publicCoursesController');

router.get('/', publicCoursesController.listOngoingCourses);

module.exports = router;
```

- [ ] **Step 5: 修改 `backend/routes/index.js`，掛載 `/courses`**

```js
const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));
router.use('/users', require('./users'));
router.use('/admin/coaches', require('./adminCoaches'));
router.use('/courses', require('./courses'));

module.exports = router;
```

- [ ] **Step 6: 執行 M4 測試**

Run（於專案根目錄）: `npm run test:m4`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
實作 M4 公開瀏覽：教練分頁列表、教練詳情、教練課程與全站進行中課程
--- feat ---
1. 新增教練分頁列表與教練詳情 API（免登入）
2. 新增教練「未結束」課程列表與全站「進行中」課程列表，兩者時間口徑分開實作
EOF
)"
```

---

### Task 5: M5 購買與報名

**Files:**
- Modify: `backend/controllers/creditPackagesController.js`（新增 `buyCreditPackage`）
- Modify: `backend/routes/creditPackage.js`（新增 `POST /:creditPackageId`，需登入）
- Modify: `backend/controllers/usersController.js`（新增 `listMyCreditPackages`、`getMyCourses`）
- Modify: `backend/routes/users.js`（新增 `GET /credit-package`、`GET /courses`）
- Create: `backend/controllers/courseBookingController.js`
- Modify: `backend/routes/courses.js`（新增 `POST /:courseId`、`DELETE /:courseId`，需登入）
- Test: `test/m5.test.js`

**Interfaces:**
- Consumes：Task 1~4 全部共用模組；`config/database.js` 的 `pool`（報名需要交易＋鎖）。
- Produces：`courseBookingController.{bookCourse, cancelBooking}`。

- [ ] **Step 1: 修改 `backend/controllers/creditPackagesController.js`，新增購買功能**

在檔案最下面 `module.exports` 之前加入：

```js
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
```

把 `module.exports` 改成：

```js
module.exports = {
  listCreditPackages,
  createCreditPackage,
  deleteCreditPackage,
  buyCreditPackage,
};
```

- [ ] **Step 2: 修改 `backend/routes/creditPackage.js`**

```js
const express = require('express');
const router = express.Router();
const creditPackagesController = require('../controllers/creditPackagesController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', creditPackagesController.listCreditPackages);
router.post('/', creditPackagesController.createCreditPackage);
router.post('/:creditPackageId', verifyToken, creditPackagesController.buyCreditPackage);
router.delete('/:creditPackageId', creditPackagesController.deleteCreditPackage);

module.exports = router;
```

- [ ] **Step 3: 修改 `backend/controllers/usersController.js`，新增購買紀錄與課表查詢**

在檔案最下面 `module.exports` 之前加入：

```js
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
```

把 `module.exports` 改成：

```js
module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  updatePassword,
  listMyCreditPackages,
  getMyCourses,
};
```

- [ ] **Step 4: 修改 `backend/routes/users.js`**

```js
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { verifyToken } = require('../middlewares/auth');

router.post('/signup', usersController.signup);
router.post('/login', usersController.login);
router.get('/profile', verifyToken, usersController.getProfile);
router.put('/profile', verifyToken, usersController.updateProfile);
router.put('/password', verifyToken, usersController.updatePassword);
router.get('/credit-package', verifyToken, usersController.listMyCreditPackages);
router.get('/courses', verifyToken, usersController.getMyCourses);

module.exports = router;
```

- [ ] **Step 5: 建立 `backend/controllers/courseBookingController.js`**

```js
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
```

- [ ] **Step 6: 修改 `backend/routes/courses.js`**

```js
const express = require('express');
const router = express.Router();
const publicCoursesController = require('../controllers/publicCoursesController');
const courseBookingController = require('../controllers/courseBookingController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', publicCoursesController.listOngoingCourses);
router.post('/:courseId', verifyToken, courseBookingController.bookCourse);
router.delete('/:courseId', verifyToken, courseBookingController.cancelBooking);

module.exports = router;
```

- [ ] **Step 7: 執行 M5 測試**

Run（於專案根目錄）: `npm run test:m5`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
實作 M5 購買與報名：方案購買、課程報名／取消、購買紀錄與課表查詢
--- feat ---
1. 新增購買方案 API，堂數與金額由後端依方案資料帶入
2. 新增報名課程 API，依序檢查課程存在、重複報名（含已取消）、剩餘堂數、名額上限
3. 新增取消報名（軟刪除）、購買紀錄查詢、本人課表查詢 API
EOF
)"
```

---

### Task 6: M6 月營收統計 + 整體回歸測試

**Files:**
- Create: `backend/controllers/revenueController.js`
- Modify: `backend/routes/adminCoaches.js`（新增 `GET /revenue`）
- Test: `test/m6.test.js`、全部 `test/*.test.js`（回歸測試）

**Interfaces:**
- Consumes：`utils/response.js`、`config/database.js`（`query`）、`middlewares/auth.js`。
- Produces：`revenueController.{getMonthlyRevenue}`。

- [ ] **Step 1: 建立 `backend/controllers/revenueController.js`**

```js
const { query } = require('../config/database');
const { successResponse, failResponse } = require('../utils/response');

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** GET /api/admin/coaches/revenue?month= */
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
```

- [ ] **Step 2: 修改 `backend/routes/adminCoaches.js`，加入 `/revenue`**

```js
const express = require('express');
const router = express.Router();
const adminCoachesController = require('../controllers/adminCoachesController');
const revenueController = require('../controllers/revenueController');
const { verifyToken, requireCoach } = require('../middlewares/auth');

// 順序地雷：/courses、/revenue 這些具名單段路由必須放在 /:userId 之前，
// 否則會被 /:userId 攔截（把字面文字當成 userId）
router.get('/courses', verifyToken, requireCoach, adminCoachesController.listMyCourses);
router.post('/courses', verifyToken, requireCoach, adminCoachesController.createCourse);
router.get('/courses/:courseId', verifyToken, adminCoachesController.getMyCourseById);
router.put('/courses/:courseId', verifyToken, adminCoachesController.updateMyCourse);
router.get('/revenue', verifyToken, requireCoach, revenueController.getMonthlyRevenue);

router.get('/', verifyToken, requireCoach, adminCoachesController.getMyCoachProfile);
router.put('/', verifyToken, requireCoach, adminCoachesController.updateMyCoachProfile);

router.post('/:userId', adminCoachesController.promoteToCoach);

module.exports = router;
```

- [ ] **Step 3: 執行 M6 測試**

Run（於專案根目錄）: `npm run test:m6`
Expected: PASS

- [ ] **Step 4: 執行整體回歸測試**

Run（於專案根目錄）: `npm test`
Expected: `Tests: 68 passed, 68 total`

若有非 M6 的測試因為前面任務的修改而回歸失敗，在這一步一併修正。

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "$(cat <<'EOF'
實作 M6 教練月營收統計，完成 M0~M6 全部主線 API 並通過整體回歸測試
--- feat ---
1. 新增教練月營收查詢 API：依報名建立時間計入月份、當年份、均價 floor 於乘後計算
--- test ---
1. 確認 npm test 全數 68 支通過
EOF
)"
```

---

### Task 7: 壓軸容器化

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Modify: `docker-compose.yml`（填入 W10 註解區塊的 `backend` 服務）
- Test: `test/smoke.test.js`

**Interfaces:**
- Consumes：Task 1~6 完成的完整 `backend/`（`npm start` 已在根目錄 `package.json` 設定妥當，不需修改）。

- [ ] **Step 1: 停止本機開發用的 `npm run dev`，釋放 8080 port**

```bash
pkill -f "nodemon ./bin/www.js" || true
```

確認沒有殘留佔用：`lsof -i :8080 || true`（沒輸出代表 port 已空出）

- [ ] **Step 2: 建立 `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080

CMD ["node", "./bin/www.js"]
```

- [ ] **Step 3: 建立 `backend/.dockerignore`**

```
node_modules
.env
npm-debug.log
docs
```

- [ ] **Step 4: 修改根目錄 `docker-compose.yml`，把 W10 註解區塊換成實際的 `backend` 服務定義**

把檔案最下面整段「W10 容器化挑戰」註解區塊（從 `# ============================================================` 到檔案結尾的 `#     retries: 5`）替換成：

```yaml
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USERNAME=student
      - DB_PASSWORD=student666
      - DB_DATABASE=fitness
      - DB_SYNCHRONIZE=true
      - DB_ENABLE_SSL=false
      - JWT_SECRET=ci-only-secret-666
      - JWT_EXPIRES_DAY=30d
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:8080/healthcheck').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\""]
      interval: 10s
      timeout: 3s
      retries: 5
```

- [ ] **Step 5: 建置並啟動容器**

```bash
docker compose up -d --build backend postgres
```

等待就緒：
```bash
for i in $(seq 1 30); do curl -sf http://localhost:8080/healthcheck && break; sleep 2; done
```
Expected：印出 `OK`

- [ ] **Step 6: 執行 smoke 測試**

Run（於專案根目錄）: `npm run test:smoke`
Expected: PASS（全部綠燈）

- [ ] **Step 7: 驗證容器重啟後資料仍在（比照 CI 的持久化檢查）**

```bash
curl -sf -X POST http://localhost:8080/api/coaches/skill \
  -H "Content-Type: application/json" \
  -d '{"name":"persist-check-manual"}'
docker compose restart backend
for i in $(seq 1 30); do curl -sf http://localhost:8080/healthcheck && break; sleep 2; done
curl -sf http://localhost:8080/api/coaches/skill | grep -q "persist-check-manual" && echo "資料持久化 OK"
```

- [ ] **Step 8: 執行整體測試（容器化狀態下的最終確認）**

Run（於專案根目錄）: `npm test`
Expected: `Tests: 68 passed, 68 total`

- [ ] **Step 9: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore docker-compose.yml && git commit -m "$(cat <<'EOF'
完成壓軸容器化：backend 服務加入 docker-compose，資料持久化驗證通過
--- feat ---
1. 新增 backend/Dockerfile 與 .dockerignore
2. docker-compose.yml 補上 backend 服務，依賴 postgres healthy 狀態、healthcheck 打 /healthcheck
--- test ---
1. 確認容器重啟後資料仍在，npm run test:smoke 與 npm test 全數通過
EOF
)"
```

---

## Self-Review 紀錄

- **Spec 覆蓋度**：對照 `docs/openapi.yaml` 全部 path，M0（healthcheck）、M1（技能/方案 CRUD）、M2（會員系統五支）、M3（升級教練、教練資料 GET/PUT、課程 GET/POST/GET-one/PUT-one）、M4（教練列表/詳情/課程、全站進行中課程）、M5（購買、報名、取消、購買紀錄、課表）、M6（月營收）皆已對應到明確任務與程式碼；加分題上傳 API 依 README 主線範圍排除，未列入計畫。
- **Placeholder 掃描**：全部步驟皆為完整可執行的程式碼或指令，無 TBD／"依上述類似"／模糊指示。
- **型別一致性**：`successResponse(res, statusCode, data)`／`failResponse(res, statusCode, message)`、`verifyToken`／`requireCoach`、`query`／`pool` 等介面簽名在所有任務間保持一致；`req.user = { id, name, email, role }` 的欄位在 Task 1 定義後，Task 2~6 皆依此存取，未出現改名或不一致。
- **路由順序地雷**已在 Task 1（技能 vs `:coachId`）、Task 3/6（`:userId` vs `/courses`、`/revenue`）明確標註並在程式碼順序中避開。
