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
  // 先 DROP 舊表（如果存在），確保新舊表結構相容
  const dropStatements = [
    'DROP TABLE IF EXISTS course_bookings CASCADE;',
    'DROP TABLE IF EXISTS credit_purchases CASCADE;',
    'DROP TABLE IF EXISTS courses CASCADE;',
    'DROP TABLE IF EXISTS coach_skills CASCADE;',
    'DROP TABLE IF EXISTS coaches CASCADE;',
    'DROP TABLE IF EXISTS credit_packages CASCADE;',
    'DROP TABLE IF EXISTS skills CASCADE;',
    'DROP TABLE IF EXISTS users CASCADE;',
  ];
  for (const statement of dropStatements) {
    await query(statement);
  }
  // 再 CREATE 新表
  for (const statement of STATEMENTS) {
    await query(statement);
  }
}

module.exports = { ensureSchema };
