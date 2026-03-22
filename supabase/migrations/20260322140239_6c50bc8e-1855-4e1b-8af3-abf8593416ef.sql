
-- node_flow_state — per-node per-turn economic flow projection
CREATE TABLE public.node_flow_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 0,
  
  -- Production (generated at this node)
  grain_production integer DEFAULT 0,
  wood_production integer DEFAULT 0,
  stone_production integer DEFAULT 0,
  iron_production integer DEFAULT 0,
  wealth_production integer DEFAULT 0,
  
  -- Trade flow through this node
  incoming_trade integer DEFAULT 0,
  outgoing_trade integer DEFAULT 0,
  
  -- Supply flow (military logistics)
  incoming_supply integer DEFAULT 0,
  outgoing_supply integer DEFAULT 0,
  
  -- Civilian/population flow
  civilian_flow integer DEFAULT 0,
  military_flow integer DEFAULT 0,
  
  -- Derived scores
  isolation_penalty integer DEFAULT 0,
  prosperity_score integer DEFAULT 0,
  congestion_score integer DEFAULT 0,
  throughput_score integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(session_id, node_id, turn_number)
);

ALTER TABLE public.node_flow_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_flow_state_read" ON public.node_flow_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_flow_state_insert" ON public.node_flow_state FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_node_flow_session_turn ON public.node_flow_state(session_id, turn_number);
CREATE INDEX idx_node_flow_node ON public.node_flow_state(node_id);
