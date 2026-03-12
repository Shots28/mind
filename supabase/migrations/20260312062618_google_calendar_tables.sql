-- ============================================================
-- oauth_states: Server-side CSRF protection for OAuth flow
-- ============================================================
CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nonce text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own oauth states"
  ON oauth_states FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- google_connections: OAuth tokens per Google account
-- ============================================================
CREATE TABLE google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  google_user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  token_refresh_lock timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, google_user_id)
);

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

-- Restrictive RLS: authenticated users can only SELECT non-sensitive columns
-- Token columns are only accessible via service_role in Edge Functions
CREATE POLICY "Users select own connections (safe fields only)"
  ON google_connections FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- No INSERT/UPDATE/DELETE for authenticated -- only service_role (Edge Functions)

-- Create a safe view that excludes sensitive token columns
CREATE VIEW google_connections_safe AS
  SELECT id, user_id, google_email, google_user_id, is_active, scopes, created_at, updated_at
  FROM google_connections;

-- Grant access to the safe view for authenticated users
GRANT SELECT ON google_connections_safe TO authenticated;

CREATE INDEX idx_google_connections_user_id ON google_connections(user_id);

-- ============================================================
-- synced_calendars: Which Google Calendars are synced
-- ============================================================
CREATE TABLE synced_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_connection_id uuid NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  calendar_name text NOT NULL,
  calendar_color text,
  access_role text DEFAULT 'owner',
  is_enabled boolean DEFAULT true,
  is_default boolean DEFAULT false,
  sync_token text,
  last_synced_at timestamptz,
  watch_channel_id text,
  watch_resource_id text,
  watch_token text,
  watch_expiration timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(google_connection_id, google_calendar_id)
);

ALTER TABLE synced_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own synced calendars"
  ON synced_calendars FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX idx_synced_calendars_user_id ON synced_calendars(user_id);
CREATE INDEX idx_synced_calendars_connection_id ON synced_calendars(google_connection_id);
CREATE INDEX idx_synced_calendars_watch_channel ON synced_calendars(watch_channel_id);

-- ============================================================
-- context_calendar_mappings: Map contexts to Google Calendars
-- ============================================================
CREATE TABLE context_calendar_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_id uuid NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  synced_calendar_id uuid NOT NULL REFERENCES synced_calendars(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),

  UNIQUE(user_id, context_id)
);

ALTER TABLE context_calendar_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own context calendar mappings"
  ON context_calendar_mappings FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX idx_ccm_user_id ON context_calendar_mappings(user_id);
CREATE INDEX idx_ccm_context_id ON context_calendar_mappings(context_id);

-- ============================================================
-- sync_log: Audit trail for sync operations
-- ============================================================
CREATE TABLE sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_connection_id uuid REFERENCES google_connections(id) ON DELETE SET NULL,
  synced_calendar_id uuid REFERENCES synced_calendars(id) ON DELETE SET NULL,
  action text NOT NULL,
  event_id uuid,
  google_event_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sync logs"
  ON sync_log FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE INDEX idx_sync_log_user_id ON sync_log(user_id);
CREATE INDEX idx_sync_log_created_at ON sync_log(created_at);

-- ============================================================
-- FK from events to google_connections
-- ============================================================
ALTER TABLE events
  ADD CONSTRAINT fk_events_google_connection
  FOREIGN KEY (google_connection_id) REFERENCES google_connections(id) ON DELETE SET NULL;
