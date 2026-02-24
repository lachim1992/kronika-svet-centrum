
-- ============================================================
-- CITY DISTRICTS (čtvrtě města)
-- Typy: residential, artisan, temple, market, military, farm
-- Každá čtvrť mění demografii, ekonomiku a mocenskou rovnováhu
-- ============================================================
CREATE TABLE public.city_districts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  district_type TEXT NOT NULL DEFAULT 'residential',
  name TEXT NOT NULL DEFAULT '',
  population_capacity INTEGER NOT NULL DEFAULT 300,
  current_population INTEGER NOT NULL DEFAULT 0,
  -- Economic effects (per-turn bonuses)
  grain_modifier INTEGER NOT NULL DEFAULT 0,
  wealth_modifier INTEGER NOT NULL DEFAULT 0,
  production_modifier INTEGER NOT NULL DEFAULT 0,
  -- Social effects
  stability_modifier INTEGER NOT NULL DEFAULT 0,
  influence_modifier DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Faction power shifts (percentage points)
  peasant_attraction INTEGER NOT NULL DEFAULT 0,
  burgher_attraction INTEGER NOT NULL DEFAULT 0,
  cleric_attraction INTEGER NOT NULL DEFAULT 0,
  military_attraction INTEGER NOT NULL DEFAULT 0,
  -- Construction
  build_cost_wealth INTEGER NOT NULL DEFAULT 50,
  build_cost_wood INTEGER NOT NULL DEFAULT 20,
  build_cost_stone INTEGER NOT NULL DEFAULT 10,
  build_turns INTEGER NOT NULL DEFAULT 2,
  build_started_turn INTEGER NOT NULL DEFAULT 1,
  completed_turn INTEGER,
  status TEXT NOT NULL DEFAULT 'building',
  -- Metadata
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.city_districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to city districts" ON public.city_districts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_city_districts_city ON public.city_districts(city_id);
CREATE INDEX idx_city_districts_session ON public.city_districts(session_id);

-- ============================================================
-- CITY FACTIONS (frakce v městě)
-- Hybridní systém: základ z demografie + hráč jmenuje vůdce
-- ============================================================
CREATE TABLE public.city_factions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  faction_type TEXT NOT NULL DEFAULT 'peasants',
  -- Core metrics (0-100)
  power INTEGER NOT NULL DEFAULT 20,
  loyalty INTEGER NOT NULL DEFAULT 50,
  satisfaction INTEGER NOT NULL DEFAULT 50,
  -- Leadership
  leader_name TEXT,
  leader_trait TEXT,
  leader_appointed_turn INTEGER,
  -- Demands & agenda
  current_demand TEXT,
  demand_urgency INTEGER NOT NULL DEFAULT 0,
  -- Metadata
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(city_id, faction_type)
);

ALTER TABLE public.city_factions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to city factions" ON public.city_factions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_city_factions_city ON public.city_factions(city_id);

-- ============================================================
-- CITY POLICIES (politiky a správní rozhodnutí)
-- Kategorie: food, labor, religion, trade, law, infrastructure
-- ============================================================
CREATE TABLE public.city_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  policy_category TEXT NOT NULL DEFAULT 'food',
  policy_key TEXT NOT NULL DEFAULT '',
  policy_value TEXT NOT NULL DEFAULT '',
  -- Computed effects (applied per turn)
  grain_effect INTEGER NOT NULL DEFAULT 0,
  wealth_effect INTEGER NOT NULL DEFAULT 0,
  stability_effect INTEGER NOT NULL DEFAULT 0,
  production_effect INTEGER NOT NULL DEFAULT 0,
  legitimacy_effect INTEGER NOT NULL DEFAULT 0,
  -- Faction impact
  faction_impact JSONB NOT NULL DEFAULT '{}',
  -- Meta
  enacted_turn INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  enacted_by TEXT NOT NULL DEFAULT '',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(city_id, policy_category, policy_key)
);

ALTER TABLE public.city_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to city policies" ON public.city_policies FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_city_policies_city ON public.city_policies(city_id);

-- ============================================================
-- Extend cities with new management metrics
-- ============================================================
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS legitimacy INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS irrigation_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temple_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS military_garrison INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ration_policy TEXT NOT NULL DEFAULT 'equal',
  ADD COLUMN IF NOT EXISTS labor_allocation JSONB NOT NULL DEFAULT '{"farming": 60, "crafting": 25, "scribes": 5, "canal": 10}',
  ADD COLUMN IF NOT EXISTS max_districts INTEGER NOT NULL DEFAULT 3;
