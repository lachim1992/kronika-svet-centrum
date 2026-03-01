-- Add age and talent potential for dynamic stat system
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS age integer NOT NULL DEFAULT 20;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS talent_potential integer NOT NULL DEFAULT 50;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS peak_age integer NOT NULL DEFAULT 28;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS birth_turn integer NOT NULL DEFAULT 0;