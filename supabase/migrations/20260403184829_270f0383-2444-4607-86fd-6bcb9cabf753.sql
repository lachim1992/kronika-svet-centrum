
-- =============================================
-- Chronicle Economy v4.1 — Phase 3: Operational Tables
-- =============================================

-- 1. Node Inventory (current state, live)
CREATE TABLE public.node_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  quality_band int NOT NULL DEFAULT 1,
  UNIQUE(node_id, good_key)
);

ALTER TABLE public.node_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_inventory_select" ON public.node_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_inventory_all" ON public.node_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_node_inventory_node ON public.node_inventory(node_id);
CREATE INDEX idx_node_inventory_good ON public.node_inventory(good_key);

-- 2. City Market Summary (aggregated projection per turn)
CREATE TABLE public.city_market_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key) ON DELETE CASCADE,
  supply_volume numeric NOT NULL DEFAULT 0,
  demand_volume numeric NOT NULL DEFAULT 0,
  avg_quality int NOT NULL DEFAULT 1,
  price_band int NOT NULL DEFAULT 0,
  price_numeric numeric NOT NULL DEFAULT 1.0,
  domestic_share numeric NOT NULL DEFAULT 1.0,
  import_share numeric NOT NULL DEFAULT 0.0,
  turn_number int NOT NULL DEFAULT 0
);

ALTER TABLE public.city_market_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "city_market_summary_select" ON public.city_market_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "city_market_summary_all" ON public.city_market_summary FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_cms_city ON public.city_market_summary(city_node_id);
CREATE INDEX idx_cms_session_turn ON public.city_market_summary(session_id, turn_number);

-- 3. Demand Baskets (per city demand tracking)
CREATE TABLE public.demand_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  basket_key text NOT NULL,
  tier int NOT NULL DEFAULT 1,
  quantity_needed numeric NOT NULL DEFAULT 0,
  quantity_fulfilled numeric NOT NULL DEFAULT 0,
  fulfillment_type text NOT NULL DEFAULT 'need',
  min_quality int NOT NULL DEFAULT 0,
  preferred_quality int NOT NULL DEFAULT 1,
  satisfaction_score numeric NOT NULL DEFAULT 0.0,
  turn_number int NOT NULL DEFAULT 0,
  UNIQUE(session_id, city_id, basket_key, turn_number)
);

ALTER TABLE public.demand_baskets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demand_baskets_select" ON public.demand_baskets FOR SELECT TO authenticated USING (true);
CREATE POLICY "demand_baskets_all" ON public.demand_baskets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_demand_baskets_city ON public.demand_baskets(city_id);
CREATE INDEX idx_demand_baskets_session ON public.demand_baskets(session_id, turn_number);

-- 4. Trade Flows (city-to-city aggregated)
CREATE TABLE public.trade_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key) ON DELETE CASCADE,
  source_city_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  target_city_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  source_player text,
  target_player text,
  flow_type text NOT NULL DEFAULT 'internal',
  volume_per_turn numeric NOT NULL DEFAULT 0,
  quality_band int NOT NULL DEFAULT 1,
  price_band int NOT NULL DEFAULT 0,
  effective_price numeric NOT NULL DEFAULT 1.0,
  trade_pressure numeric NOT NULL DEFAULT 0,
  friction_score numeric NOT NULL DEFAULT 0,
  maturity int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'latent',
  route_path_id uuid REFERENCES public.flow_paths(id) ON DELETE SET NULL,
  turn_created int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_flows_select" ON public.trade_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "trade_flows_all" ON public.trade_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_trade_flows_session ON public.trade_flows(session_id);
CREATE INDEX idx_trade_flows_source ON public.trade_flows(source_city_id);
CREATE INDEX idx_trade_flows_target ON public.trade_flows(target_city_id);
CREATE INDEX idx_trade_flows_status ON public.trade_flows(status);
CREATE INDEX idx_trade_flows_good ON public.trade_flows(good_key);
