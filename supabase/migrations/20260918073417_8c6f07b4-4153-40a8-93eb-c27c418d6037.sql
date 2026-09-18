CREATE TABLE IF NOT EXISTS public.economy_recompute_locks (
  session_id UUID PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.economy_recompute_locks TO authenticated;
GRANT ALL ON public.economy_recompute_locks TO service_role;

ALTER TABLE public.economy_recompute_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read economy recompute locks"
ON public.economy_recompute_locks FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_economy_recompute_locks_updated_at
BEFORE UPDATE ON public.economy_recompute_locks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();