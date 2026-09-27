ALTER TABLE public.ai_invocation_log
  ADD COLUMN IF NOT EXISTS turn_number integer,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_tokens integer,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS automatic boolean,
  ADD COLUMN IF NOT EXISTS input_chars integer;
CREATE INDEX IF NOT EXISTS ai_invocation_log_turn_idx ON public.ai_invocation_log (session_id, turn_number);

CREATE TABLE IF NOT EXISTS public.turn_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_number)
);
GRANT SELECT ON public.turn_digests TO authenticated;
GRANT ALL ON public.turn_digests TO service_role;
ALTER TABLE public.turn_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read turn digests" ON public.turn_digests
  FOR SELECT TO authenticated USING (public.is_session_member(session_id, auth.uid()));

ALTER TABLE public.wiki_entries ADD COLUMN IF NOT EXISTS needs_enrichment boolean NOT NULL DEFAULT false;