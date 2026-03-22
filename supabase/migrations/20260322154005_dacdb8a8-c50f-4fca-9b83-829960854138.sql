
-- Add flow regulation and urbanization columns to province_nodes
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS throughput_military real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS toll_rate real NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS cumulative_trade_flow real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urbanization_score real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hinterland_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resource_output jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flow_role text NOT NULL DEFAULT 'neutral';

-- Add comment for documentation
COMMENT ON COLUMN public.province_nodes.throughput_military IS 'Military throughput rate 0-1. Fortress can block army passage.';
COMMENT ON COLUMN public.province_nodes.toll_rate IS 'Fraction of trade value extracted as toll (0-1). Feeds local urbanization.';
COMMENT ON COLUMN public.province_nodes.cumulative_trade_flow IS 'Total trade value that has passed through this node historically.';
COMMENT ON COLUMN public.province_nodes.urbanization_score IS 'Abstract growth score, materializes as new minor nodes at thresholds.';
COMMENT ON COLUMN public.province_nodes.hinterland_level IS 'Current materialization tier (0=none, 1=village, 2=workshops, 3=suburb).';
COMMENT ON COLUMN public.province_nodes.resource_output IS 'Per-turn resource output flowing to parent major node.';
COMMENT ON COLUMN public.province_nodes.flow_role IS 'Role: neutral, regulator, gateway, producer, hub.';
