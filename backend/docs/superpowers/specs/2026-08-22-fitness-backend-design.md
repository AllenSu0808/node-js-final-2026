# 健身房網站後端建置 — 設計文件

日期：2026/08/22
狀態：待實作
權威規格來源：`docs/openapi.yaml`（本文件不重複列出所有欄位細節，僅記錄架構決策；實作時以 OpenAPI 為準）

## 背景與範圍

依 `README.md` 主線任務，從零建置 `backend/`，實作 M0～M6 七個里程碑 API 與壓軸容器化，讓現成前端（`frontend/`）與 Swagger（`docs/openapi.yaml`）能正確運作。加分題（圖片上傳）不在本次範圍內。

驗收方式：`npm run test:m1` ～ `npm run test:m6`（黑箱打 API）、`npm test`（全部 68 支）、容器化後 `npm run test:smoke`。

## 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| Web 框架 | Express 5 | 既有鷹架已裝好 |
| 資料庫存取 | 原生 `pg`（不用 ORM） | 既有鷹架已選定；README 允許自由選擇 |
| 密碼雜湊 | `bcryptjs` | 純 JS 實作，Alpine Docker image 不需裝編譯工具，建置更快更穩（已與使用者確認） |
| JWT | `jsonwebtoken` | payload 固定含 `{ id, role, exp }` |
| 欄位驗證 | 手寫驗證函式，不用套件 | 錯誤訊息文字需逐字對應規格書，手刻較好控制 |
| UUID 產生 | PostgreSQL `pgcrypto` 擴充套件 `gen_random_uuid()` | 由資料庫層統一產生，各表 PK 預設值 |

## 資料庫 Schema（啟動時 `CREATE TABLE IF NOT EXISTS` 自動建立）

- `users`：id, name, email(unique), password, role(USER/COACH), created_at, updated_at
- `skills`：id, name(unique), created_at, updated_at
- `credit_packages`：id, name(unique), credit_amount, price(numeric), created_at
- `coaches`：id, user_id(unique FK→users), experience_years, description, profile_image_url(nullable), created_at, updated_at
- `coach_skills`：coach_id(FK), skill_id(FK)，複合 PK（教練-技能多對多，PUT 時整批覆蓋＝先刪後插）
- `courses`：id, user_id(FK→users，即開課教練), skill_id(FK), name, description, start_at, end_at, max_participants, meeting_url, created_at, updated_at
- `credit_purchases`：id, user_id(FK), credit_package_id(FK), purchased_credits, price_paid, purchase_at
- `course_bookings`：id, user_id(FK), course_id(FK), created_at, cancelled_at(nullable)，**UNIQUE(user_id, course_id)**

**關鍵設計**：`course_bookings` 對 `(user_id, course_id)` 建資料庫層 UNIQUE 約束。因為規格明訂「取消過的課不能再報名」（重複報名檢查包含已取消紀錄），這個組合本來就永遠只能存在一筆，用資料庫約束保證一致性，應用層再包一層對應「已經報名過此課程」的友善錯誤訊息。

剩餘堂數／已用堂數／參加人數皆為即時計算欄位（SUM/COUNT），不落地存值，避免與報名/取消狀態不同步。

## 專案結構

```
backend/
  bin/www.js            # 進入點：await 資料庫連線＋建表完成後才 app.listen
  app.js                 # express 設定、/healthcheck（純文字 "OK"，不套 JSON）
  config/database.js     # pg Pool（既有）
  db/schema.js           # 建表 SQL，啟動時執行
  middlewares/auth.js    # verifyToken（401 三種訊息）／requireCoach（401 使用者尚未成為教練）
  utils/
    validators.js         # isNotValidString / isNotValidInteger / isValidUUID / isValidHttpsUrl / isValidPassword
    password.js            # bcryptjs 雜湊與比對
    jwt.js                  # sign/verify 封裝
    response.js              # successResponse / failResponse 統一輸出格式
  routes/                    # 依 OpenAPI 資源分組掛載
  controllers/                # 商業邏輯＋SQL 查詢
```

## 路由順序地雷（規格書已明確警告，設計時一併避開）

1. `GET/POST /api/coaches/skill` 必須註冊在 `GET /api/coaches/:coachId` 之前 —— 否則 `skill` 字面會被當成 `:coachId` 吃掉。因此 M1 技能路由與 M4 公開教練路由會合併在同一個 router 檔案（`routes/coaches.js`），依序註冊：`/skill` 系列 → `/`（列表）→ `/:coachId` → `/:coachId/courses`。
2. `POST /api/admin/coaches/:userId`（升級教練）是最泛用的單段 POST 路由，必須註冊在 `POST /api/admin/coaches/courses`（開課）**之後**，否則 `.../courses` 這個 path 會被 `:userId` 攔截、把字串 `"courses"` 當成 userId。`routes/adminCoaches.js` 內路由順序：`/courses`（GET/POST）→ `/courses/:courseId`（GET/PUT）→ `/revenue` → `/`（GET/PUT own profile）→ `/:userId`（POST，放最後）。

## 商業邏輯重點（來自規格書的隱形語意，逐條記錄避免遺漏）

- **M5 報名檢查順序**（先中先回）：課程存在 → 是否已報名過（含已取消）→ 剩餘堂數是否 >0 → 名額是否已滿。四句固定錯誤訊息一字不能改：`已經報名過此課程`／`已無可使用堂數`／`已達最大參加人數，無法參加`／`請先登入`。
- **M5 取消＝軟刪除**：只標記 `cancelled_at`，不刪紀錄；剩餘堂數＝Σ購買堂數－未取消報名數，每次即時算。
- **M4 兩種時間口徑不同**（規格書特別強調會分開測）：教練課表用「未結束」＝`end_at > now`；全站進行中課程用「進行中」＝`start_at <= now < end_at`。
- **M6 月營收三條隱形規則**：①依「報名建立時間」而非上課時間計入月份；②年份固定為伺服器當年，`month` 參數收英文小寫月份名；③單堂均價＝全部方案 Σprice÷Σcredit_amount，`revenue = floor(當月未取消報名數 × 均價)`，floor 必須在乘完之後才做（在 Node 端用浮點數計算，不在 SQL 端用 numeric 除法，避免精度落差）。
- **M3 profile_image_url 規則不對稱**：升級教練（POST）選填、更新教練資料（PUT）必填，兩支都要求「有值必須 https 開頭」。
- **M3 課程單筆查詢/更新是 owner-scoped**：不是本人開的課與 id 不存在回同一句「課程不存在」，避免洩漏其他教練的課程存在與否。

## 既有程式碼需修正項目

`backend/app.js` 目前 `/healthcheck` 回 JSON，規格明訂**必須回純文字 `OK`**（全文件唯一不套 `{status,data}` 包裝的端點）。這會讓 docker-compose healthcheck 與 CI 的等待邏輯都失敗，需在動工前修正；同時 `bin/www.js` 改為等資料庫連線與建表完成後才呼叫 `app.listen`，讓「健康檢查回 200＝資料庫已就緒」這個保證從進入點層級成立，`/healthcheck` 路由本身可以單純回應而不必每次查詢資料庫。

## 分階段開發與 commit 策略

依序：修正 M0 → M1 → M2 → M3 → M4 → M5 → M6 → 壓軸容器化。每個階段完成後執行對應的 `npm run test:mX` 直到綠燈才 commit（commit message 依使用者全域 `git-commit.md` 規則的中文分類格式）。全部 M1～M6 綠燈後執行整體 `npm test`（目標 `68 passed`），再進行容器化：撰寫 `backend/Dockerfile`、`backend/.dockerignore`，並依 `docker-compose.yml` 內 W10 註解補上 `backend` 服務，最後跑 `docker compose up -d --build backend postgres && npm run test:smoke` 驗證。

## 測試策略

沿用專案既有的黑箱合約測試（`test/m1.test.js` ~ `test/m6.test.js`、`test/smoke.test.js`），不另外撰寫單元測試——因為驗收機制本身就是靠這些外部合約測試，且它們已經涵蓋所有主線行為與錯誤訊息文字，重複造一份內部單元測試不會提高驗收把握度，反而增加維護成本。開發時搭配 Swagger UI（`localhost:8081`）Try it out 做互動式除錯。
