-- Peeters Family Dashboard schema
-- Runs once, on first creation of the db_data volume.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- CALENDAR
-- ─────────────────────────────────────────────
CREATE TABLE calendars (
  slug        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  colour      TEXT NOT NULL
);

INSERT INTO calendars (slug, label, colour) VALUES
  ('matt',   'Matt',   '#3b82f6'),
  ('family', 'Family', '#10b981'),
  ('forest', 'Forest', '#f97316');

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
  ('malachi', 'Malachi', '#6366f1', '🦖', 1),
  ('atticus', 'Atticus', '#ec4899', '🚀', 2);

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
  ('bedtime_end',    '06:30');
