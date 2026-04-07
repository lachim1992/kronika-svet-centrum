ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS goods_production_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_supply_volume numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_wealth_fiscal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS economy_version integer DEFAULT 3;