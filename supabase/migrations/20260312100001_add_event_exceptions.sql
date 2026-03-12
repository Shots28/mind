-- Add exceptions column for excluding individual dates from recurring events
ALTER TABLE events ADD COLUMN IF NOT EXISTS exceptions text[] DEFAULT '{}';
