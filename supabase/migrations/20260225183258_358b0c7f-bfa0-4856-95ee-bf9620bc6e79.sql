-- Step 1: Extend game_events with event-sourcing columns
ALTER TABLE public.game_events
  ADD COLUMN IF NOT EXISTS reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS command_id uuid,
  ADD COLUMN IF NOT EXISTS caused_by_event_id uuid,
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'player';

-- Unique constraint for idempotency (nullable, so only non-null values are checked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_events_command_id
  ON public.game_events (command_id)
  WHERE command_id IS NOT NULL;

-- Index for causality chain lookups
CREATE INDEX IF NOT EXISTS idx_game_events_caused_by
  ON public.game_events (caused_by_event_id)
  WHERE caused_by_event_id IS NOT NULL;

-- Index for projection queries: canon events by session+turn
CREATE INDEX IF NOT EXISTS idx_game_events_projection
  ON public.game_events (session_id, turn_number, created_at)
  WHERE truth_state = 'canon';