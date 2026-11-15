CREATE TABLE public.field_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  attacker_player text NOT NULL,
  defender_player text NOT NULL,
  attacker_stack_id uuid NOT NULL,
  defender_stack_id uuid NOT NULL,
  battlefield jsonb NOT NULL,
  status text NOT NULL DEFAULT 'deploying',
  started_turn integer NOT NULL,
  round integer NOT NULL DEFAULT 0,
  last_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX field_battles_one_active_attacker ON public.field_battles(attacker_stack_id) WHERE status <> 'finished';
CREATE UNIQUE INDEX field_battles_one_active_defender ON public.field_battles(defender_stack_id) WHERE status <> 'finished';
GRANT SELECT ON public.field_battles TO authenticated;
GRANT ALL ON public.field_battles TO service_role;
ALTER TABLE public.field_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read field battles" ON public.field_battles FOR SELECT TO authenticated
USING (app_private.is_session_member(session_id, auth.uid()));