
-- Node Projects: players can build new nodes, routes, fortifications, ports, etc.
CREATE TABLE public.node_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  
  project_type TEXT NOT NULL DEFAULT 'build_route',
  -- build_route / upgrade_route / create_fort / create_port / expand_hub / build_road / repair_route
  
  province_id UUID REFERENCES public.provinces(id) ON DELETE SET NULL,
  node_id UUID REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.province_routes(id) ON DELETE SET NULL,
  target_node_id UUID REFERENCES public.province_nodes(id) ON DELETE SET NULL,
  
  initiated_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  -- active / completed / cancelled / blocked
  
  name TEXT NOT NULL DEFAULT 'Projekt',
  description TEXT,
  
  cost_gold INTEGER NOT NULL DEFAULT 0,
  cost_wood INTEGER NOT NULL DEFAULT 0,
  cost_stone INTEGER NOT NULL DEFAULT 0,
  cost_iron INTEGER NOT NULL DEFAULT 0,
  
  progress INTEGER NOT NULL DEFAULT 0,
  total_turns INTEGER NOT NULL DEFAULT 3,
  
  result_payload JSONB DEFAULT '{}',
  
  created_turn INTEGER NOT NULL DEFAULT 0,
  completed_turn INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.node_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view projects in their session"
  ON public.node_projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Players can insert their own projects"
  ON public.node_projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Players can update their own projects"
  ON public.node_projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_node_projects_session ON public.node_projects(session_id);
CREATE INDEX idx_node_projects_status ON public.node_projects(session_id, status);
