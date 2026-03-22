
CREATE TABLE public.province_control_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  province_id uuid NOT NULL REFERENCES public.provinces(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 0,
  control_player text,
  dominance numeric NOT NULL DEFAULT 0,
  control_scores jsonb NOT NULL DEFAULT '{}',
  total_strategic_value numeric NOT NULL DEFAULT 0,
  node_count integer NOT NULL DEFAULT 0,
  controlled_node_count integer NOT NULL DEFAULT 0,
  supply_health numeric NOT NULL DEFAULT 1.0,
  route_access_score numeric NOT NULL DEFAULT 1.0,
  contested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, province_id, turn_number)
);

ALTER TABLE public.province_control_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read province control snapshots"
  ON public.province_control_snapshots FOR SELECT TO authenticated
  USING (true);
