CREATE TABLE IF NOT EXISTS public.world_layer_tick_guards (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, turn_number)
);

GRANT SELECT ON public.world_layer_tick_guards TO authenticated;
GRANT ALL ON public.world_layer_tick_guards TO service_role;

ALTER TABLE public.world_layer_tick_guards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_layer_tick_guards'
      AND policyname = 'Session members can read world layer tick guards'
  ) THEN
    CREATE POLICY "Session members can read world layer tick guards"
      ON public.world_layer_tick_guards FOR SELECT TO authenticated
      USING (public.is_session_member(session_id));
  END IF;
END $$;