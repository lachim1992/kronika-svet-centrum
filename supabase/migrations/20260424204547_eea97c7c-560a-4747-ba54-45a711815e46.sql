
ALTER TABLE public.route_state
  ADD COLUMN IF NOT EXISTS player_invested_gold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_maintained_turn integer,
  ADD COLUMN IF NOT EXISTS turns_unpaid integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.node_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  turn_number integer NOT NULL,
  from_node uuid,
  to_node uuid NOT NULL,
  population_delta integer NOT NULL,
  reason text NOT NULL,
  route_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_node_migrations_session_turn ON public.node_migrations(session_id, turn_number DESC);
ALTER TABLE public.node_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Migrations readable" ON public.node_migrations;
CREATE POLICY "Migrations readable" ON public.node_migrations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages migrations" ON public.node_migrations;
CREATE POLICY "Service role manages migrations" ON public.node_migrations FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.heritage_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  lineage_id text NOT NULL,
  lineage_label text NOT NULL,
  effect_type text NOT NULL,
  effect_value numeric NOT NULL,
  effect_target text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_heritage_effects_session_player ON public.heritage_effects(session_id, player_name);
ALTER TABLE public.heritage_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Heritage effects readable" ON public.heritage_effects;
CREATE POLICY "Heritage effects readable" ON public.heritage_effects FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages heritage effects" ON public.heritage_effects;
CREATE POLICY "Service role manages heritage effects" ON public.heritage_effects FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_route_with_state AS
SELECT
  pr.id AS route_id,
  pr.session_id,
  pr.node_a,
  pr.node_b,
  pr.route_type,
  pr.control_state AS route_control_cache,
  rs.lifecycle_state,
  rs.maintenance_level,
  rs.upkeep_cost,
  rs.player_invested_gold,
  rs.last_maintained_turn,
  rs.turns_unpaid
FROM public.province_routes pr
LEFT JOIN public.route_state rs ON rs.route_id = pr.id;
