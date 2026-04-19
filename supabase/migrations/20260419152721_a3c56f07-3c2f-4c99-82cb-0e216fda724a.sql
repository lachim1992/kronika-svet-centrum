ALTER TABLE public.world_foundations
  ADD COLUMN IF NOT EXISTS worldgen_spec jsonb,
  ADD COLUMN IF NOT EXISTS worldgen_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bootstrap_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS bootstrap_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'world_foundations_bootstrap_status_check'
  ) THEN
    ALTER TABLE public.world_foundations
      ADD CONSTRAINT world_foundations_bootstrap_status_check
      CHECK (bootstrap_status IN ('pending', 'bootstrapping', 'ready', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_world_foundations_worldgen_spec
  ON public.world_foundations USING gin (worldgen_spec);

CREATE INDEX IF NOT EXISTS idx_world_foundations_bootstrap_status
  ON public.world_foundations (bootstrap_status);