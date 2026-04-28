-- ─── Etapa 1: Trade systems core tables ───

CREATE TABLE IF NOT EXISTS public.trade_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  system_key text NOT NULL,
  node_count int NOT NULL DEFAULT 0,
  route_count int NOT NULL DEFAULT 0,
  total_capacity numeric NOT NULL DEFAULT 0,
  member_players text[] NOT NULL DEFAULT '{}',
  computed_turn int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, system_key)
);
CREATE INDEX IF NOT EXISTS idx_trade_systems_session ON public.trade_systems(session_id);

CREATE TABLE IF NOT EXISTS public.trade_system_basket_supply (
  session_id uuid NOT NULL,
  trade_system_id uuid NOT NULL REFERENCES public.trade_systems(id) ON DELETE CASCADE,
  basket_key text NOT NULL,
  total_supply numeric NOT NULL DEFAULT 0,
  total_demand numeric NOT NULL DEFAULT 0,
  surplus numeric NOT NULL DEFAULT 0,
  shortage numeric NOT NULL DEFAULT 0,
  price_index numeric NOT NULL DEFAULT 1.0,
  avg_quality numeric NOT NULL DEFAULT 1.0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, trade_system_id, basket_key)
);
CREATE INDEX IF NOT EXISTS idx_tsbs_session ON public.trade_system_basket_supply(session_id);

CREATE TABLE IF NOT EXISTS public.trade_system_node_snapshot (
  session_id uuid NOT NULL,
  node_id uuid NOT NULL,
  trade_system_id uuid,
  system_key text,
  snapshot_turn int,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_tsns_session ON public.trade_system_node_snapshot(session_id);

CREATE TABLE IF NOT EXISTS public.player_trade_system_access (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  trade_system_id uuid NOT NULL REFERENCES public.trade_systems(id) ON DELETE CASCADE,
  access_level text NOT NULL,
  tariff_factor numeric NOT NULL DEFAULT 1.0,
  access_source text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, player_name, trade_system_id)
);
CREATE INDEX IF NOT EXISTS idx_ptsa_player ON public.player_trade_system_access(session_id, player_name);
CREATE INDEX IF NOT EXISTS idx_ptsa_system ON public.player_trade_system_access(trade_system_id);

CREATE TABLE IF NOT EXISTS public.diplomatic_treaties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  treaty_type text NOT NULL,
  player_a text NOT NULL,
  player_b text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  signed_turn int,
  cancelled_turn int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treaties_session_active ON public.diplomatic_treaties(session_id, status);
CREATE INDEX IF NOT EXISTS idx_treaties_players ON public.diplomatic_treaties(session_id, player_a, player_b);

-- ─── Rozšíření existujících tabulek ───

ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS trade_system_id uuid;
CREATE INDEX IF NOT EXISTS idx_province_nodes_trade_system ON public.province_nodes(trade_system_id) WHERE trade_system_id IS NOT NULL;

ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS route_origin text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS construction_state text NOT NULL DEFAULT 'complete';
CREATE INDEX IF NOT EXISTS idx_province_routes_origin ON public.province_routes(session_id, route_origin);
CREATE INDEX IF NOT EXISTS idx_province_routes_construction ON public.province_routes(session_id, construction_state);

ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS manpower_available int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS military_gold_upkeep numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS military_food_upkeep numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS over_mobilized boolean NOT NULL DEFAULT false;
-- Pozn: manpower_pool a manpower_committed už existují, manpower_mobilized ne — přidat:
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS manpower_mobilized int NOT NULL DEFAULT 0;

ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS soldiers int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assignment text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS assigned_route_id uuid,
  ADD COLUMN IF NOT EXISTS upkeep_gold numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upkeep_food numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS construction_progress numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_military_stacks_assignment ON public.military_stacks(session_id, assignment) WHERE assignment <> 'idle';
CREATE INDEX IF NOT EXISTS idx_military_stacks_route ON public.military_stacks(assigned_route_id) WHERE assigned_route_id IS NOT NULL;

-- ─── Backfilly (idempotentní) ───

UPDATE public.realm_resources
SET manpower_available = GREATEST(0, COALESCE(manpower_pool, 0) - COALESCE(manpower_committed, 0))
WHERE manpower_available = 0;

UPDATE public.military_stacks
SET soldiers = GREATEST(1, ROUND(COALESCE(power, 0) / 1.0)::int)
WHERE (soldiers IS NULL OR soldiers = 0) AND is_active = true;

-- ─── RLS ───

ALTER TABLE public.trade_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_system_basket_supply ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_system_node_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_trade_system_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomatic_treaties ENABLE ROW LEVEL SECURITY;

-- Public read pro session members (sezení je shared world state, čitelný všem auth users v sezení)
CREATE POLICY "trade_systems readable by authenticated"
  ON public.trade_systems FOR SELECT TO authenticated USING (true);

CREATE POLICY "trade_system_basket_supply readable by authenticated"
  ON public.trade_system_basket_supply FOR SELECT TO authenticated USING (true);

CREATE POLICY "trade_system_node_snapshot readable by authenticated"
  ON public.trade_system_node_snapshot FOR SELECT TO authenticated USING (true);

CREATE POLICY "player_trade_system_access readable by authenticated"
  ON public.player_trade_system_access FOR SELECT TO authenticated USING (true);

CREATE POLICY "diplomatic_treaties readable by authenticated"
  ON public.diplomatic_treaties FOR SELECT TO authenticated USING (true);

-- Žádné write policies → jen service role (edge functions) může psát.

-- updated_at triggery
CREATE TRIGGER trg_trade_systems_updated_at
  BEFORE UPDATE ON public.trade_systems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_diplomatic_treaties_updated_at
  BEFORE UPDATE ON public.diplomatic_treaties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();