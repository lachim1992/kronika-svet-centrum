
-- ═══════════════════════════════════════════
-- 1. world_routes — macro strategic axes (Silk Road, sea lanes, imperial roads)
-- ═══════════════════════════════════════════
CREATE TABLE public.world_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  route_kind text NOT NULL DEFAULT 'trade_corridor',
  start_node_id uuid REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  end_node_id uuid REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  waypoint_node_ids uuid[] DEFAULT '{}',
  capacity_value integer DEFAULT 10,
  strategic_value integer DEFAULT 5,
  economic_value integer DEFAULT 5,
  military_value integer DEFAULT 3,
  control_state text DEFAULT 'open',
  controlled_by text,
  route_path jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.world_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_routes_read" ON public.world_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "world_routes_insert" ON public.world_routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "world_routes_update" ON public.world_routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_world_routes_session ON public.world_routes(session_id);

-- ═══════════════════════════════════════════
-- 2. Warfare extensions on military_stacks
-- ═══════════════════════════════════════════
ALTER TABLE public.military_stacks 
  ADD COLUMN IF NOT EXISTS battle_context text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blockading_route_id uuid REFERENCES public.province_routes(id) ON DELETE SET NULL DEFAULT NULL;

-- ═══════════════════════════════════════════  
-- 3. province_routes warfare fields
-- ═══════════════════════════════════════════
ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS blocked_by text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ambush_stack_id uuid REFERENCES public.military_stacks(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS damage_level integer DEFAULT 0;

-- ═══════════════════════════════════════════
-- 4. province_nodes siege state
-- ═══════════════════════════════════════════
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS siege_turn_start integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS besieged_by text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS besieging_stack_id uuid REFERENCES public.military_stacks(id) ON DELETE SET NULL DEFAULT NULL;
