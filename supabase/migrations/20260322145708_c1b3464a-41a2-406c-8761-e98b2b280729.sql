
-- Supply chain state per node per turn
CREATE TABLE public.supply_chain_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  node_id UUID NOT NULL,
  turn_number INTEGER NOT NULL DEFAULT 0,
  connected_to_capital BOOLEAN NOT NULL DEFAULT true,
  isolation_turns INTEGER NOT NULL DEFAULT 0,
  supply_level NUMERIC NOT NULL DEFAULT 10,
  route_quality NUMERIC NOT NULL DEFAULT 1.0,
  production_modifier NUMERIC NOT NULL DEFAULT 1.0,
  stability_modifier NUMERIC NOT NULL DEFAULT 0,
  morale_modifier NUMERIC NOT NULL DEFAULT 0,
  supply_source_node_id UUID,
  hop_distance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, node_id, turn_number)
);

ALTER TABLE public.supply_chain_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read supply chain state"
  ON public.supply_chain_state FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_supply_chain_session_turn ON public.supply_chain_state(session_id, turn_number);
