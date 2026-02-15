-- Add turn management columns to game_sessions
ALTER TABLE public.game_sessions
ADD COLUMN current_turn integer NOT NULL DEFAULT 1,
ADD COLUMN turn_closed_p1 boolean NOT NULL DEFAULT false,
ADD COLUMN turn_closed_p2 boolean NOT NULL DEFAULT false;