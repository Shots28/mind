-- Expand events table for Google Calendar sync and richer event data

-- New event fields
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS recurring_event_id uuid,
  ADD COLUMN IF NOT EXISTS original_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS is_read_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_connection_id uuid,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_etag text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Self-referential FK for recurring event instances
ALTER TABLE events
  ADD CONSTRAINT fk_events_recurring_parent
  FOREIGN KEY (recurring_event_id) REFERENCES events(id) ON DELETE CASCADE;

-- Partial unique index to prevent duplicate Google events per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_google_event_id
  ON events(user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- Indexes for sync operations
CREATE INDEX IF NOT EXISTS idx_events_google_connection_id ON events(google_connection_id);
CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);
CREATE INDEX IF NOT EXISTS idx_events_recurring_event_id ON events(recurring_event_id);
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
