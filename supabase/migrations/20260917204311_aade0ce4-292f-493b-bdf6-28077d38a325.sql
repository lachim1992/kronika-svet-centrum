CREATE TABLE public.road_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  owner_player text NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  path_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','completed','cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  total_work integer NOT NULL DEFAULT 1 CHECK (total_work > 0),
  work_done integer NOT NULL DEFAULT 0 CHECK (work_done >= 0),
  cost_gold numeric NOT NULL DEFAULT 0,
  cost_production numeric NOT NULL DEFAULT 0,
  bridge_count integer NOT NULL DEFAULT 0,
  started_turn integer NOT NULL,
  completed_turn integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.road_projects TO authenticated;
GRANT ALL ON public.road_projects TO service_role;
ALTER TABLE public.road_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view road projects" ON public.road_projects FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.game_memberships gm WHERE gm.session_id = road_projects.session_id AND gm.user_id = auth.uid()));

CREATE TABLE public.road_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.road_projects(id) ON DELETE SET NULL,
  owner_player text NOT NULL,
  from_x integer NOT NULL,
  from_y integer NOT NULL,
  to_x integer NOT NULL,
  to_y integer NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','completed','degraded','blocked')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  capacity numeric NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  speed numeric NOT NULL DEFAULT 1 CHECK (speed > 0),
  friction numeric NOT NULL DEFAULT 1 CHECK (friction >= 0),
  maintenance numeric NOT NULL DEFAULT 0 CHECK (maintenance >= 0),
  bridge_count integer NOT NULL DEFAULT 0,
  path_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  utilization numeric NOT NULL DEFAULT 0 CHECK (utilization >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (abs(from_x - to_x) + abs(from_y - to_y) = 1),
  UNIQUE (session_id, from_x, from_y, to_x, to_y)
);
GRANT SELECT ON public.road_segments TO authenticated;
GRANT ALL ON public.road_segments TO service_role;
ALTER TABLE public.road_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view road segments" ON public.road_segments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.game_memberships gm WHERE gm.session_id = road_segments.session_id AND gm.user_id = auth.uid()));
CREATE INDEX road_segments_session_from_idx ON public.road_segments(session_id, from_x, from_y);
CREATE INDEX road_segments_session_to_idx ON public.road_segments(session_id, to_x, to_y);
CREATE INDEX road_segments_session_status_idx ON public.road_segments(session_id, status);
CREATE INDEX road_projects_session_status_idx ON public.road_projects(session_id, status);

ALTER TABLE public.trade_flows ADD COLUMN IF NOT EXISTS path_cells jsonb;
ALTER TABLE public.trade_flows ADD COLUMN IF NOT EXISTS transport_modes text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.basket_trade_flows ADD COLUMN IF NOT EXISTS path_cells jsonb;
ALTER TABLE public.basket_trade_flows ADD COLUMN IF NOT EXISTS transport_modes text[] NOT NULL DEFAULT '{}'::text[];