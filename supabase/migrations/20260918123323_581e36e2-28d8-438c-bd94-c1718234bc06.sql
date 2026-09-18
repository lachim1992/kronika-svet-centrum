ALTER TABLE public.trade_systems
  ADD COLUMN IF NOT EXISTS total_production_capacity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_importance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spur_connected_nodes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.trade_systems.total_production_capacity IS 'Layer A: sum of production_output of nodes attached to this road/river system (direct + catchment spur).';
COMMENT ON COLUMN public.trade_systems.total_importance IS 'Sum of node importance_score of attached nodes — significance weight of the system.';
COMMENT ON COLUMN public.trade_systems.spur_connected_nodes IS 'How many nodes joined via catchment radius (road within N tiles) rather than a road on their own tile.';