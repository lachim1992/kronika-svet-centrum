-- Drop the old unique constraint that doesn't account for league_tier
ALTER TABLE league_seasons DROP CONSTRAINT league_seasons_session_id_season_number_key;

-- Add new unique constraint that includes league_tier
ALTER TABLE league_seasons ADD CONSTRAINT league_seasons_session_tier_season_unique UNIQUE (session_id, league_tier, season_number);