-- Demand provenance + class-aware consequence of the canonical demand model.
-- Written only by replace_goods_economy_projection (physical/derived projection).
ALTER TABLE public.city_market_baskets ADD COLUMN IF NOT EXISTS demand_detail jsonb;
COMMENT ON COLUMN public.city_market_baskets.demand_detail IS
  'Canonical demand model: {demand_class, group, label, channels{household_need,...}, coverage, band, severity, alert, effect, tool_coverage}. Derived, never a second demand solver.';