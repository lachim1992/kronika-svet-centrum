-- Add league tier support
ALTER TABLE league_seasons ADD COLUMN IF NOT EXISTS league_tier integer NOT NULL DEFAULT 1;
ALTER TABLE league_seasons ADD COLUMN IF NOT EXISTS promotion_count integer NOT NULL DEFAULT 2;
ALTER TABLE league_seasons ADD COLUMN IF NOT EXISTS relegation_count integer NOT NULL DEFAULT 2;

-- Add tier to teams
ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS league_tier integer NOT NULL DEFAULT 1;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_league_teams_tier ON league_teams(session_id, league_tier, is_active);
CREATE INDEX IF NOT EXISTS idx_league_seasons_tier ON league_seasons(session_id, league_tier, status);