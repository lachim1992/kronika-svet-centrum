CREATE TABLE IF NOT EXISTS public.ai_faction_turn_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  faction_name text NOT NULL,
  turn_number integer NOT NULL,
  doctrine text,
  war_state text,
  actions_planned integer DEFAULT 0,
  actions_executed integer DEFAULT 0,
  actions_failed integer DEFAULT 0,
  recruits_attempted integer DEFAULT 0,
  builds_attempted integer DEFAULT 0,
  attacks_attempted integer DEFAULT 0,
  power_delta numeric DEFAULT 0,
  wealth_delta numeric DEFAULT 0,
  internal_thought text,
  failure_reasons text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (session_id, faction_name, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_ai_faction_turn_summary_session_turn
  ON public.ai_faction_turn_summary (session_id, turn_number DESC);

ALTER TABLE public.ai_faction_turn_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and moderators can view ai turn summaries"
  ON public.ai_faction_turn_summary
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Service role can write ai turn summaries"
  ON public.ai_faction_turn_summary
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);