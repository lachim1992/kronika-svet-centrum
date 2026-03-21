
CREATE TABLE public.province_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  node_a uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  node_b uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  route_type text NOT NULL DEFAULT 'land_road',
  capacity_value integer NOT NULL DEFAULT 5,
  military_relevance integer NOT NULL DEFAULT 5,
  economic_relevance integer NOT NULL DEFAULT 5,
  vulnerability_score integer NOT NULL DEFAULT 3,
  control_state text NOT NULL DEFAULT 'open',
  build_cost integer NOT NULL DEFAULT 0,
  upgrade_level integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, node_a, node_b)
);

ALTER TABLE public.province_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Province routes are viewable by everyone"
  ON public.province_routes FOR SELECT
  USING (true);

CREATE INDEX idx_province_routes_session ON public.province_routes(session_id);
CREATE INDEX idx_province_routes_nodes ON public.province_routes(node_a, node_b);
