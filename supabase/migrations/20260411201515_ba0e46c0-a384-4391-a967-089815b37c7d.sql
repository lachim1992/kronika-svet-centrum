-- 1. Table: market_shares (player-level per basket per turn)
CREATE TABLE public.market_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  player_name text NOT NULL,
  basket_key text NOT NULL,
  auto_production numeric DEFAULT 0,
  bonus_production numeric DEFAULT 0,
  quality_weight numeric DEFAULT 1,
  effective_export numeric DEFAULT 0,
  global_export numeric DEFAULT 0,
  global_demand numeric DEFAULT 0,
  market_share numeric DEFAULT 0,
  domestic_satisfaction numeric DEFAULT 0,
  wealth_generated numeric DEFAULT 0,
  turn_number int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, player_name, basket_key, turn_number)
);

ALTER TABLE public.market_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_market_shares" ON public.market_shares
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_market_shares_session_turn ON public.market_shares(session_id, turn_number);

-- 2. Table: city_market_baskets (city-level per basket per turn)
CREATE TABLE public.city_market_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  city_id uuid REFERENCES public.cities(id) ON DELETE CASCADE NOT NULL,
  player_name text NOT NULL,
  basket_key text NOT NULL,
  auto_supply numeric DEFAULT 0,
  bonus_supply numeric DEFAULT 0,
  local_demand numeric DEFAULT 0,
  local_supply numeric DEFAULT 0,
  domestic_satisfaction numeric DEFAULT 0,
  export_surplus numeric DEFAULT 0,
  quality_weight numeric DEFAULT 1,
  market_access numeric DEFAULT 1,
  monetization numeric DEFAULT 1,
  turn_number int DEFAULT 1,
  UNIQUE(session_id, city_id, basket_key, turn_number)
);

ALTER TABLE public.city_market_baskets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_city_market_baskets" ON public.city_market_baskets
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_city_market_baskets_session ON public.city_market_baskets(session_id, turn_number);

-- 3. New columns on realm_resources
ALTER TABLE public.realm_resources ADD COLUMN IF NOT EXISTS wealth_domestic_component numeric DEFAULT 0;
ALTER TABLE public.realm_resources ADD COLUMN IF NOT EXISTS wealth_market_share numeric DEFAULT 0;