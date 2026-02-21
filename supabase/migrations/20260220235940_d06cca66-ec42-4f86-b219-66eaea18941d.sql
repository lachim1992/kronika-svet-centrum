
-- Add last_applied_turn for stockpile idempotency
ALTER TABLE public.player_resources ADD COLUMN IF NOT EXISTS last_applied_turn integer NOT NULL DEFAULT 0;
