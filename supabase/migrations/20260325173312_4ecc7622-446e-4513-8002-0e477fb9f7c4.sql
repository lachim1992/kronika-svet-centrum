CREATE TABLE public.economy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  override_key text NOT NULL,
  override_value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, override_key)
);

ALTER TABLE public.economy_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read economy overrides"
  ON public.economy_overrides FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage overrides"
  ON public.economy_overrides FOR ALL
  TO authenticated USING (true) WITH CHECK (true);