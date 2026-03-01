
-- Allow multiple teams per city (for AI factions with 3 teams sharing 1 stadium)
ALTER TABLE league_teams DROP CONSTRAINT IF EXISTS league_teams_session_id_city_id_key;
