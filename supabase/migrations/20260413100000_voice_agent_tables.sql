-- Voice AI Agent: call preferences, call logs, and journal entry linking

-- Call preferences per user (scheduling, phone, voice selection)
CREATE TABLE call_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  phone_number text,
  phone_verified boolean DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/New_York',
  preferred_call_time time NOT NULL DEFAULT '21:00',
  call_frequency text NOT NULL DEFAULT 'daily'
    CHECK (call_frequency IN ('daily', 'weekdays', 'weekends', 'custom')),
  call_days integer[],
  voice_id text,
  is_active boolean DEFAULT false,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE call_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call preferences"
  ON call_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Call log (every call attempt)
CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vapi_call_id text UNIQUE,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer')),
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  transcript text,
  summary text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calls"
  ON calls FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_calls_user_scheduled ON calls(user_id, scheduled_at);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_vapi_id ON calls(vapi_call_id);

-- Link journal entries to voice calls
ALTER TABLE journal_entries
  ADD COLUMN call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'voice_agent'));

-- Auto-update updated_at on call_preferences
CREATE OR REPLACE FUNCTION update_call_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_preferences_updated_at
  BEFORE UPDATE ON call_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_call_preferences_updated_at();
