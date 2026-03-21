
-- Phase 2: Province Internal Strategic Nodes

CREATE TABLE public.province_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  province_id UUID NOT NULL REFERENCES public.provinces(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL DEFAULT 'resource_node',
  name TEXT NOT NULL DEFAULT '',
  hex_q INTEGER NOT NULL DEFAULT 0,
  hex_r INTEGER NOT NULL DEFAULT 0,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  strategic_value INTEGER NOT NULL DEFAULT 0,
  economic_value INTEGER NOT NULL DEFAULT 0,
  defense_value INTEGER NOT NULL DEFAULT 0,
  mobility_relevance INTEGER NOT NULL DEFAULT 0,
  supply_relevance INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, province_id, node_type, hex_q, hex_r)
);

CREATE INDEX idx_province_nodes_session ON public.province_nodes(session_id);
CREATE INDEX idx_province_nodes_province ON public.province_nodes(province_id);
CREATE INDEX idx_province_nodes_type ON public.province_nodes(node_type);

ALTER TABLE public.province_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Province nodes readable by authenticated users"
  ON public.province_nodes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Province nodes insertable by authenticated users"
  ON public.province_nodes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Province nodes updatable by authenticated users"
  ON public.province_nodes FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_province_nodes_updated_at
  BEFORE UPDATE ON public.province_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
