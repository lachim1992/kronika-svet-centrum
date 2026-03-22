
-- =============================================
-- Chronicle Spatial Model v1 — Schema Extension
-- =============================================

-- 1. province_nodes: add hierarchy, population, fortification, infrastructure
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS parent_node_id uuid REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_major boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS population integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS growth_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fortification_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infrastructure_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Backfill is_major for existing major node types
UPDATE public.province_nodes
SET is_major = true
WHERE node_type IN ('primary_city', 'secondary_city', 'fortress', 'port', 'trade_hub');

-- 2. province_routes: add speed, safety, control, cross-province flag
ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS speed_value integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS safety_value integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS controlled_by text,
  ADD COLUMN IF NOT EXISTS is_cross_province boolean NOT NULL DEFAULT false;

-- 3. military_stacks: add stance
ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS stance text NOT NULL DEFAULT 'idle';

-- 4. provinces: add control_state, primary_node_id, economic_value, defense_value
ALTER TABLE public.provinces
  ADD COLUMN IF NOT EXISTS control_state text NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS primary_node_id uuid REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS economic_value integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defense_value integer NOT NULL DEFAULT 0;
