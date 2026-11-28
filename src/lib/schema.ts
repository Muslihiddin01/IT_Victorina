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

  // Пояснение «почему этот ответ правильный» — ученик видит его в разборе ошибок
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation text NOT NULL DEFAULT ''`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS explanation text NOT NULL DEFAULT ''`,

  // Таджикский язык: переводы тем и вопросов. Пусто — ученик видит русский вариант.
  // Варианты идут парами: options_tj[2] — перевод options[2].
  `ALTER TABLE topics ADD COLUMN IF NOT EXISTS title_tj text`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS text_tj text`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS options_tj jsonb`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation_tj text NOT NULL DEFAULT ''`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS topic_title_tj text`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS text_tj text`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS options_tj jsonb`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS explanation_tj text NOT NULL DEFAULT ''`,

  // Картинки к вопросам. id — отпечаток (sha256) самого файла, поэтому одна картинка хранится один раз.
  // В вопросе и в копии вопроса для комнаты лежит только этот id.
  `CREATE TABLE IF NOT EXISTS images (
    id text PRIMARY KEY,
    mime text NOT NULL,
    data text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS image text`,
  `ALTER TABLE room_questions ADD COLUMN IF NOT EXISTS image text`,

  // Комната «Печатание на скорость»: вместо вопросов — английские слова на 30 или 60 секунд.
  // Результат ученика — слов в минуту (wpm).
  `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'quiz'`,
  `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS typing_sec int`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS wpm int`,

  // Норма печатания по этапам: первый месяц — 30 слов в минуту, потом учитель поднимает (40, …).
  // Этап длится от started_at до начала следующего. Первый этап начинается с самого первого теста печатания.
  `CREATE TABLE IF NOT EXISTS typing_goals (
    id serial PRIMARY KEY,
    wpm int NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now()
  )`,
  `INSERT INTO typing_goals (wpm, started_at)
   SELECT 30, coalesce((SELECT min(started_at) FROM rooms WHERE kind = 'typing'), now())
    WHERE NOT EXISTS (SELECT 1 FROM typing_goals)`,

  // Разовые правки данных (например, обновление первых вопросов). Каждая выполняется один раз.
  `CREATE TABLE IF NOT EXISTS migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`,

  // Починка: ранняя версия сохраняла JSON как строку внутри jsonb. Превращаем обратно в массивы.
  `UPDATE questions SET options = (options #>> '{}')::jsonb WHERE jsonb_typeof(options) = 'string'`,
  `UPDATE rooms SET topic_ids = (topic_ids #>> '{}')::jsonb WHERE jsonb_typeof(topic_ids) = 'string'`,
  `UPDATE room_questions SET options = (options #>> '{}')::jsonb WHERE jsonb_typeof(options) = 'string'`,
  `UPDATE participants SET answers = (answers #>> '{}')::jsonb WHERE jsonb_typeof(answers) = 'string'`,
];
