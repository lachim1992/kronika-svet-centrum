CREATE TABLE public.hex_population (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  q integer NOT NULL,
  r integer NOT NULL,
  carrying_capacity integer NOT NULL DEFAULT 0,
  rural_population integer NOT NULL DEFAULT 0,
  mobile_population integer NOT NULL DEFAULT 0,
  last_resolved_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, q, r)
);
CREATE INDEX idx_hex_population_session ON public.hex_population (session_id);

GRANT SELECT ON public.hex_population TO authenticated;
GRANT ALL ON public.hex_population TO service_role;
ALTER TABLE public.hex_population ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members can read rural population"
  ON public.hex_population FOR SELECT TO authenticated
  USING (public.is_session_member(session_id, auth.uid()));

CREATE TRIGGER update_hex_population_updated_at
  BEFORE UPDATE ON public.hex_population
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.city_population_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  population_before integer NOT NULL DEFAULT 0,
  population_after integer NOT NULL DEFAULT 0,
  births integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  local_immigration integer NOT NULL DEFAULT 0,
  intercity_immigration integer NOT NULL DEFAULT 0,
  emigration integer NOT NULL DEFAULT 0,
  extraordinary_losses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, city_id, turn_number)
);
CREATE INDEX idx_city_population_ledger_session_turn ON public.city_population_ledger (session_id, turn_number);

GRANT SELECT ON public.city_population_ledger TO authenticated;
GRANT ALL ON public.city_population_ledger TO service_role;
ALTER TABLE public.city_population_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members can read the population ledger"
  ON public.city_population_ledger FOR SELECT TO authenticated
  USING (public.is_session_member(session_id, auth.uid()));

CREATE TRIGGER update_city_population_ledger_updated_at
  BEFORE UPDATE ON public.city_population_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();