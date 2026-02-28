
-- Add victory tracking to game_sessions
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS victory_status TEXT DEFAULT 'active';
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS victory_winner TEXT;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS victory_data JSONB DEFAULT '{}';

-- Mark AI faction capital cities (first city of each AI faction is the capital)
ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_capital BOOLEAN DEFAULT false;
