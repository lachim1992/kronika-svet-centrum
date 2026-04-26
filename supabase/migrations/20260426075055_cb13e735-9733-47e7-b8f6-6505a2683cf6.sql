CREATE TABLE public.ai_invocation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  function_name text NOT NULL,
  player_name text,
  premise_version int,
  player_context_used boolean NOT NULL DEFAULT false,
  lineage_names_available text[] NOT NULL DEFAULT '{}',
  model text,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_invocation_log_session_idx
  ON public.ai_invocation_log (session_id, created_at DESC);

CREATE INDEX ai_invocation_log_function_idx
  ON public.ai_invocation_log (function_name, created_at DESC);

ALTER TABLE public.ai_invocation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and moderators can read ai_invocation_log"
  ON public.ai_invocation_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );