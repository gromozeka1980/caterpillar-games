-- Events table for analytics
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  event_data jsonb
);

CREATE INDEX events_created_at_idx ON events (created_at DESC);
CREATE INDEX events_session_idx ON events (session_id);
CREATE INDEX events_type_idx ON events (event_type);

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can insert events
CREATE POLICY "Anyone can insert events"
  ON events FOR INSERT
  WITH CHECK (true);

-- Only admins can read events
CREATE POLICY "Only admins can read events"
  ON events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
