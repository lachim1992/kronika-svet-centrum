
-- ─── PR-A: Ancient Layer reálné dopady ──────────────────────────────

ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS mythic_tag text,
  ADD COLUMN IF NOT EXISTS founding_era text NOT NULL DEFAULT 'historical',
  ADD COLUMN IF NOT EXISTS heritage_lineage_id text;

ALTER TABLE public.province_nodes
  ADD CONSTRAINT province_nodes_founding_era_check
  CHECK (founding_era IN ('ancient','legendary','historical','recent'));

CREATE INDEX IF NOT EXISTS idx_province_nodes_mythic
  ON public.province_nodes(session_id)
  WHERE mythic_tag IS NOT NULL;

COMMENT ON COLUMN public.province_nodes.mythic_tag IS
  'Optional tag from worldgen_spec.ancient_layer.mythic_seeds[]. Marks pre-history relic nodes.';
COMMENT ON COLUMN public.province_nodes.founding_era IS
  'Era of founding: ancient (pre-reset), legendary, historical (default), recent.';

-- realm_heritage: vybrané rody per hráč
CREATE TABLE IF NOT EXISTS public.realm_heritage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  lineage_id text NOT NULL,
  lineage_name text NOT NULL,
  cultural_anchor text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, player_name, lineage_id)
);

CREATE INDEX IF NOT EXISTS idx_realm_heritage_session
  ON public.realm_heritage(session_id);

ALTER TABLE public.realm_heritage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read realm heritage"
  ON public.realm_heritage FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can write realm heritage"
  ON public.realm_heritage FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─── PR-B: route_state authoritative table ──────────────────────────

CREATE TABLE IF NOT EXISTS public.route_state (
  route_id uuid PRIMARY KEY REFERENCES public.province_routes(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  lifecycle_state text NOT NULL DEFAULT 'usable',
  maintenance_level int NOT NULL DEFAULT 50,
  quality_level int NOT NULL DEFAULT 50,
  last_maintained_turn int NOT NULL DEFAULT 0,
  upkeep_cost int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_state_lifecycle_check
    CHECK (lifecycle_state IN ('planned','under_construction','usable','maintained','degraded','blocked')),
  CONSTRAINT route_state_maintenance_range CHECK (maintenance_level BETWEEN 0 AND 100),
  CONSTRAINT route_state_quality_range CHECK (quality_level BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_route_state_session
  ON public.route_state(session_id);

ALTER TABLE public.route_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read route state"
  ON public.route_state FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can write route state"
  ON public.route_state FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Backfill existujících tras
INSERT INTO public.route_state (route_id, session_id, lifecycle_state, maintenance_level, quality_level, upkeep_cost)
SELECT id, session_id, 'usable', 50, 50, GREATEST(1, capacity_value / 5)
FROM public.province_routes
ON CONFLICT (route_id) DO NOTHING;

COMMENT ON COLUMN public.province_routes.control_state IS
  '[CACHE: K1 — authoritative source = route_state.lifecycle_state. Synced in commit-turn Phase 4.]';

-- ─── K3 retention: world_events cleanup helper ──────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_route_events(p_session_id uuid, p_current_turn int)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM world_events
  WHERE session_id = p_session_id
    AND event_type IN ('route_decay','route_maintained','route_blocked')
    AND turn_number < p_current_turn - 50;
END;
$$;
