ALTER TABLE public.diplomacy_messages
  ADD COLUMN IF NOT EXISTS processed_for_memory_turn INT,
  ADD COLUMN IF NOT EXISTS action_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_diplomacy_messages_unprocessed
  ON public.diplomacy_messages (room_id)
  WHERE processed_for_memory_turn IS NULL;