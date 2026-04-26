-- ============================================
-- Patch 1: Discovery, Neutral Nodes & Influence
-- ============================================

-- 1) Rozšíření province_nodes
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS is_neutral boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discovered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS culture_key text,
  ADD COLUMN IF NOT EXISTS profile_key text,
  ADD COLUMN IF NOT EXISTS autonomy_score integer DEFAULT 80,
  ADD COLUMN IF NOT EXISTS discovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS discovered_by text;

UPDATE public.province_nodes
   SET discovered = true
 WHERE controlled_by IS NOT NULL
   AND discovered = false;

CREATE INDEX IF NOT EXISTS idx_province_nodes_neutral
  ON public.province_nodes (session_id, is_neutral)
  WHERE is_neutral = true;

CREATE INDEX IF NOT EXISTS idx_province_nodes_discovered
  ON public.province_nodes (session_id, discovered);

-- 2) map_visibility
CREATE TABLE IF NOT EXISTS public.map_visibility (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  tile_q integer NOT NULL,
  tile_r integer NOT NULL,
  visibility text NOT NULL DEFAULT 'unknown'
    CHECK (visibility IN ('unknown','seen','visible')),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  discovered_by text,
  PRIMARY KEY (session_id, player_name, tile_q, tile_r)
);
CREATE INDEX IF NOT EXISTS idx_map_visibility_session_player
  ON public.map_visibility (session_id, player_name);

ALTER TABLE public.map_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_visibility readable by authenticated"
  ON public.map_visibility FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_visibility insertable by authenticated"
  ON public.map_visibility FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_visibility updatable by authenticated"
  ON public.map_visibility FOR UPDATE TO authenticated USING (true);

-- 3) world_node_outputs
CREATE TABLE IF NOT EXISTS public.world_node_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  basket_key text NOT NULL,
  good_key text,
  quantity numeric NOT NULL DEFAULT 1,
  quality numeric NOT NULL DEFAULT 1,
  exportable_ratio numeric NOT NULL DEFAULT 0.4,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_world_node_outputs_session
  ON public.world_node_outputs (session_id);
CREATE INDEX IF NOT EXISTS idx_world_node_outputs_node
  ON public.world_node_outputs (node_id);

ALTER TABLE public.world_node_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_node_outputs readable by authenticated"
  ON public.world_node_outputs FOR SELECT TO authenticated USING (true);
CREATE POLICY "world_node_outputs insertable by authenticated"
  ON public.world_node_outputs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "world_node_outputs updatable by authenticated"
  ON public.world_node_outputs FOR UPDATE TO authenticated USING (true);

-- 4) node_trade_links
CREATE TABLE IF NOT EXISTS public.node_trade_links (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  link_status text NOT NULL DEFAULT 'none'
    CHECK (link_status IN ('none','contacted','trade_open','protected','vassalized','annexed')),
  trade_level integer NOT NULL DEFAULT 0,
  route_safety numeric NOT NULL DEFAULT 1,
  route_distance numeric,
  export_access numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, player_name, node_id)
);
CREATE INDEX IF NOT EXISTS idx_node_trade_links_session_player
  ON public.node_trade_links (session_id, player_name);

ALTER TABLE public.node_trade_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_trade_links readable by authenticated"
  ON public.node_trade_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_trade_links insertable by authenticated"
  ON public.node_trade_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "node_trade_links updatable by authenticated"
  ON public.node_trade_links FOR UPDATE TO authenticated USING (true);

-- 5) node_influence
CREATE TABLE IF NOT EXISTS public.node_influence (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  economic_influence numeric NOT NULL DEFAULT 0,
  political_influence numeric NOT NULL DEFAULT 0,
  military_pressure numeric NOT NULL DEFAULT 0,
  resistance numeric NOT NULL DEFAULT 50,
  integration_progress numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, player_name, node_id)
);
CREATE INDEX IF NOT EXISTS idx_node_influence_session_player
  ON public.node_influence (session_id, player_name);

ALTER TABLE public.node_influence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_influence readable by authenticated"
  ON public.node_influence FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_influence insertable by authenticated"
  ON public.node_influence FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "node_influence updatable by authenticated"
  ON public.node_influence FOR UPDATE TO authenticated USING (true);
