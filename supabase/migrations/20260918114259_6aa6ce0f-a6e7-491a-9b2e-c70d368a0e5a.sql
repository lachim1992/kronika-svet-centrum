ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS total_production_capacity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_domestic_consumption_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_extraction_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_value_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.realm_resources.total_production_capacity IS 'Layer A: sum of province_nodes.production_output = organized production capacity (potential). Written only by aggregate-realm-totals.';
COMMENT ON COLUMN public.realm_resources.total_production IS 'DEPRECATED alias of total_production_capacity. Do not use for GDP or fiscal math.';
COMMENT ON COLUMN public.realm_resources.goods_production_value IS 'Layer B: value of realized domestic output = (auto_supply + recipe_bonus + building_bonus) x basketValue. Never derived from post-trade local_supply.';
COMMENT ON COLUMN public.realm_resources.goods_value_detail IS 'Breakdown of goods_production_value: { auto, recipe, structures }. Invariant: sum == goods_production_value.';
COMMENT ON COLUMN public.realm_resources.goods_domestic_consumption_value IS 'Layer B: sum over baskets of (local_demand - unmet_demand) x basketValue, post-trade. Source for domestic_tax_base.';
COMMENT ON COLUMN public.realm_resources.goods_extraction_value IS 'Layer B: value of recipe output produced on nodes with production_role = source. Provenance recorded at production time.';
COMMENT ON COLUMN public.realm_resources.total_gdp IS 'Provisional GDP proxy = goods_production_value. export_gross_value must NOT be added (double counting). TODO: value-added pass.';
COMMENT ON COLUMN public.realm_resources.production_reserve IS 'DEPRECATED accrual: legacy totalCityProduction no longer feeds this. CAPEX source pending construction-goods pass.';

COMMENT ON COLUMN public.province_nodes.production_output IS 'Layer A: organized production capacity (potential) of the node. Only path downstream is the recipe throughput budget in compute-trade-flows. Must not feed grain, GDP, tax bases or production_reserve.';
COMMENT ON COLUMN public.province_nodes.wealth_output IS 'LEGACY abstract wealth-flow from compute-economy-flow. Deprecated: not commercial capacity, not realm wealth. Readable only by compute-economy-flow and dev/debug tooling.';