// Таблицы базы данных. «IF NOT EXISTS» — создаём, только если их ещё нет.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'student')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS topics (
    id serial PRIMARY KEY,
    title text NOT NULL,
    position int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id int NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
    text text NOT NULL,
    options jsonb NOT NULL,
    correct int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`,

  `CREATE TABLE IF NOT EXISTS rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'finished')),
    duration_min int NOT NULL,
    question_count int NOT NULL,
    topic_ids jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    ends_at timestamptz,
    finished_at timestamptz
  )`,

  // Код комнаты уникален среди незавершённых комнат
  `CREATE UNIQUE INDEX IF NOT EXISTS rooms_active_code ON rooms (code) WHERE status <> 'finished'`,

  // Вопросы конкретной игры — копия, чтобы правка вопроса не ломала старые результаты
  `CREATE TABLE IF NOT EXISTS room_questions (
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    n int NOT NULL,
    topic_title text NOT NULL,
    text text NOT NULL,
    options jsonb NOT NULL,
    correct int NOT NULL,
    PRIMARY KEY (room_id, n)
  )`,

  `CREATE TABLE IF NOT EXISTS participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    login text NOT NULL,
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    loaded_at timestamptz,
    submitted_at timestamptz,
    finished_at timestamptz,
    answers jsonb,
    answered int,
    score int,
    total int,
    leaves int NOT NULL DEFAULT 0,
    away_ms int NOT NULL DEFAULT 0,
    online_count int NOT NULL DEFAULT 0,
    online_mode boolean NOT NULL DEFAULT false,
    last_event_at timestamptz,
    UNIQUE (room_id, user_id)
  )`,
];
