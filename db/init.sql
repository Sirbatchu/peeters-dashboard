-- Peeters Family Dashboard schema
-- Runs once, on first creation of the db_data volume.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- CALENDAR
-- ─────────────────────────────────────────────
CREATE TABLE calendars (
  slug        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  colour      TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 50
);

-- One row per person the dashboard colour-codes by, plus the shared buckets.
-- Family is deliberately neutral slate; the greens/blues belong to people.
INSERT INTO calendars (slug, label, colour, sort_order) VALUES
  ('family',    'Family',          '#64748b', 0),
  ('matt',      'Matthew Peeters', '#8b5cf6', 1),
  ('jamie-lee', 'Jamie-Lee',       '#7dd3fc', 2),
  ('malachi',   'Malachi',         '#3b82f6', 3),
  ('atticus',   'Atticus',         '#10b981', 4),
  ('waverly',   'Waverly',         '#f9a8d4', 5);

CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar     TEXT NOT NULL REFERENCES calendars(slug) ON DELETE RESTRICT,
  title        TEXT NOT NULL,
  description  TEXT,
  location     TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  all_day      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Recurrence: NULL freq = one-off. Stored as the rule, expanded at read time.
  recur_freq     TEXT CHECK (recur_freq IN ('daily','weekly','monthly','yearly')),
  recur_interval INT  NOT NULL DEFAULT 1 CHECK (recur_interval BETWEEN 1 AND 52),
  recur_until    DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ends_after_starts CHECK (ends_at >= starts_at)
);

CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE INDEX events_calendar_idx  ON events (calendar);

-- Who an event was emailed to. Purely a record; we are not a CalDAV server.
CREATE TABLE event_invites (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_invites_event_idx ON event_invites (event_id);

-- ─────────────────────────────────────────────
-- KIDS
-- ─────────────────────────────────────────────
CREATE TABLE kids (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '⭐',
  sort_order  INT  NOT NULL DEFAULT 0
);

INSERT INTO kids (slug, name, colour, emoji, sort_order) VALUES
  ('malachi', 'Malachi', '#3b82f6', '🚀', 1),
  ('atticus', 'Atticus', '#10b981', '🦖', 2),
  ('waverly', 'Waverly', '#f9a8d4', '🦄', 3);

-- Editable from the UI, so the list changes without a deploy.
CREATE TABLE checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_slug    TEXT REFERENCES kids(slug) ON DELETE CASCADE,  -- NULL = applies to all kids
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '✅',
  points      INT  NOT NULL DEFAULT 1,
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO checklist_items (kid_slug, label, emoji, sort_order) VALUES
  (NULL, 'Eaten breakfast',              '🥣', 1),
  (NULL, 'Bowl/plate in the dishwasher', '🍽️', 2),
  (NULL, 'Cleaned the table',            '🧹', 3),
  (NULL, 'Brushed teeth',                '🪥', 4),
  (NULL, 'Gotten dressed',               '👕', 5),
  (NULL, 'Tidied up toys',               '🧸', 6),
  (NULL, 'Kiss for mummy and daddy',     '💋', 7);

-- One row per kid per item per day. Presence = ticked.
CREATE TABLE checklist_ticks (
  kid_slug   TEXT NOT NULL REFERENCES kids(slug) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  ticked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kid_slug, item_id, day)
);

CREATE INDEX checklist_ticks_day_idx ON checklist_ticks (day DESC);

-- A day is "complete" when every active item for that kid was ticked.
-- Written by the API on the tick that completes the set, so streaks
-- survive later edits to the item list.
CREATE TABLE kid_days (
  kid_slug     TEXT NOT NULL REFERENCES kids(slug) ON DELETE CASCADE,
  day          DATE NOT NULL,
  points       INT  NOT NULL DEFAULT 0,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (kid_slug, day)
);

-- Things kids are saving their stars up for. Claiming spends stars:
-- balance = SUM(kid_days.points) - SUM(claimed rewards' cost).
CREATE TABLE rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_slug    TEXT REFERENCES kids(slug) ON DELETE CASCADE,  -- NULL = any kid
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🎁',
  cost        INT  NOT NULL,
  claimed_at  TIMESTAMPTZ,
  claimed_by  TEXT REFERENCES kids(slug) ON DELETE SET NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO rewards (kid_slug, label, emoji, cost) VALUES
  (NULL, 'Movie night',       '🍿', 50),
  (NULL, 'Trip to the park',  '🛝', 30),
  (NULL, 'Choose dinner',     '🍕', 40);

-- ─────────────────────────────────────────────
-- BIRTHDAYS  (migrated off localStorage)
-- ─────────────────────────────────────────────
CREATE TABLE birthdays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  day         INT  NOT NULL CHECK (day   BETWEEN 1 AND 31),
  month       INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  birth_year  INT
);

-- ─────────────────────────────────────────────
-- HOUSEHOLD GLUE
-- ─────────────────────────────────────────────
CREATE TABLE shopping_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  emoji      TEXT,
  ticked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One dinner per calendar day.
CREATE TABLE meals (
  day    DATE PRIMARY KEY,
  title  TEXT NOT NULL,
  emoji  TEXT NOT NULL DEFAULT '🍽️',
  notes  TEXT
);

-- Simple key/value settings, editable from the dashboard.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('morning_start',  '07:00'),   -- countdown appears from here...
  ('morning_leave',  '08:30'),   -- ...counting down to here
  ('school_days',    '12345'),   -- ISO weekday numbers, Mon=1
  ('bedtime_start',  '19:00'),   -- dashboard dims from here
  ('bedtime_end',    '06:30'),
  ('background_mode',  'sky'),  -- sky | photo | slideshow
  ('background_photo', ''),     -- file name when mode = photo
  ('background_mins',  '15');   -- slideshow interval

-- ─────────────────────────────────────────────
-- RECIPES, NOTES, ALEXA
-- ─────────────────────────────────────────────
-- Reusable meals with ingredient lists, so a planned dinner can fill the
-- shopping list in one tap.
CREATE TABLE recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL UNIQUE,
  emoji       TEXT NOT NULL DEFAULT '🍽️',
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE meals ADD COLUMN recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- Family notes board. Author is a calendars slug so notes share people's colours.
CREATE TABLE notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body       TEXT NOT NULL,
  author     TEXT REFERENCES calendars(slug) ON DELETE SET NULL,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alexa morning briefing + bedtime. Targets are Home Assistant notify
-- entities from the Alexa Devices integration.
INSERT INTO settings (key, value) VALUES
  ('briefing_enabled', '1'),
  ('briefing_time',    '07:15'),
  ('briefing_days',    '12345'),
  ('briefing_target',  'notify.kitchen_speak'),
  ('briefing_last',    ''),
  ('bedtime_target',   'notify.bedroom_speak'),
  ('bedtime_command',  'play relaxing sleep music'),
  ('bedtime_message',  'Goodnight everyone. Time to wind down.'),
  ('dim_command',      '');
