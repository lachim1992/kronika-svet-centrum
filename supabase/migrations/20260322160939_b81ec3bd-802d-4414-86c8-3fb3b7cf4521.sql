
-- ═══════════════════════════════════════════════════════════════
-- Chronicle Economic Model v1: Flow-based macro economy
-- ═══════════════════════════════════════════════════════════════

-- 1. Add flow economy columns to province_nodes
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS production_output numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_output numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS importance_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incoming_production numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_efficiency numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS connectivity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS route_access_factor numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS development_level numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS stability_factor numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS isolation_penalty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_resource_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_resource_type text DEFAULT NULL;

-- 2. Create node_economy_history for tracking flow over turns
CREATE TABLE IF NOT EXISTS public.node_economy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 0,
  production_output numeric NOT NULL DEFAULT 0,
  wealth_output numeric NOT NULL DEFAULT 0,
  capacity_score numeric NOT NULL DEFAULT 0,
  importance_score numeric NOT NULL DEFAULT 0,
  incoming_production numeric NOT NULL DEFAULT 0,
  connectivity_score numeric NOT NULL DEFAULT 0,
  isolation_penalty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_economy_history_session_turn
  ON public.node_economy_history(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_node_economy_history_node
  ON public.node_economy_history(node_id);

-- 3. Add macro economy columns to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS total_production numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wealth numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_capacity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_importance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_iron_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_horses_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_salt_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_copper_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_gold_tier integer NOT NULL DEFAULT 0;

-- 4. RLS for node_economy_history (public read for game participants)
ALTER TABLE public.node_economy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read node economy history"
  ON public.node_economy_history FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert node economy history"
  ON public.node_economy_history FOR INSERT
  WITH CHECK (true);
