ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS construction_available_for_capex numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.realm_resources.construction_available_for_capex IS
  'Layer B derived volume: construction basket material left after local demand, imports and exports. Sole legitimate source of production_reserve accrual (CAPEX). Written by compute-basket-trade-flows only.';