ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS trade_system_id uuid REFERENCES public.trade_systems(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cities_trade_system ON public.cities(session_id, trade_system_id);

COMMENT ON COLUMN public.cities.trade_system_id IS 'Derived (Layer A): trade system the city attaches to via completed roads/rivers within its catchment radius. Written only by compute-trade-systems.';