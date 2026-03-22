
-- Flow paths table: stores computed hex-level paths between nodes
CREATE TABLE public.flow_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.province_routes(id) ON DELETE CASCADE,
  node_a UUID NOT NULL,
  node_b UUID NOT NULL,
  flow_type TEXT NOT NULL DEFAULT 'trade',
  hex_path JSONB NOT NULL DEFAULT '[]',
  total_cost NUMERIC NOT NULL DEFAULT 0,
  bottleneck_hex JSONB,
  bottleneck_cost NUMERIC DEFAULT 0,
  path_length INT NOT NULL DEFAULT 0,
  computed_turn INT NOT NULL DEFAULT 0,
  is_dirty BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flow_paths_session ON public.flow_paths(session_id);
CREATE INDEX idx_flow_paths_route ON public.flow_paths(route_id);
CREATE INDEX idx_flow_paths_dirty ON public.flow_paths(session_id, is_dirty) WHERE is_dirty = true;
CREATE UNIQUE INDEX idx_flow_paths_unique ON public.flow_paths(session_id, node_a, node_b, flow_type);

-- Add hex-path metadata columns to province_routes
ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS hex_path_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hex_bottleneck_q INT,
  ADD COLUMN IF NOT EXISTS hex_bottleneck_r INT,
  ADD COLUMN IF NOT EXISTS hex_path_length INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS path_dirty BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_path_turn INT DEFAULT 0;

-- Enable RLS
ALTER TABLE public.flow_paths ENABLE ROW LEVEL SECURITY;

-- Public read for authenticated
CREATE POLICY "flow_paths_read" ON public.flow_paths FOR SELECT TO authenticated USING (true);
