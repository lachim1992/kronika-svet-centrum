
-- ═══════════════════════════════════════════
-- BUILDING TEMPLATES (predefined catalog)
-- ═══════════════════════════════════════════
CREATE TABLE public.building_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'economic',
  description TEXT NOT NULL DEFAULT '',
  flavor_text TEXT,
  cost_wood INTEGER NOT NULL DEFAULT 0,
  cost_stone INTEGER NOT NULL DEFAULT 0,
  cost_iron INTEGER NOT NULL DEFAULT 0,
  cost_wealth INTEGER NOT NULL DEFAULT 0,
  build_turns INTEGER NOT NULL DEFAULT 1,
  required_settlement_level TEXT NOT NULL DEFAULT 'HAMLET',
  effects JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_prompt TEXT,
  is_unique BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.building_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read building templates" ON public.building_templates FOR SELECT USING (true);

-- Seed predefined buildings
INSERT INTO public.building_templates (name, category, description, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, effects, flavor_text) VALUES
-- Economic
('Tržnice', 'economic', 'Centrální místo obchodu a výměny zboží.', 5, 2, 0, 10, 1, 'HAMLET', '{"wealth_income": 2, "population_growth": 0.5}', 'Kde se sejdou kupci, tam kvete i osada.'),
('Pila', 'economic', 'Zpracovává dřevo z okolních lesů.', 8, 1, 2, 5, 1, 'HAMLET', '{"wood_income": 3, "wealth_income": 1}', 'Zvuk sekyr zní od úsvitu do soumraku.'),
('Kamenolom', 'economic', 'Těží kámen z blízkých skal.', 3, 0, 2, 8, 2, 'HAMLET', '{"stone_income": 3, "wealth_income": 1}', 'Každý kvádr nese pot dělníků.'),
('Kovárna', 'economic', 'Zpracovává rudu na železné nástroje a zbraně.', 4, 3, 0, 12, 2, 'TOWNSHIP', '{"iron_income": 2, "wealth_income": 1, "manpower_bonus": 5}', 'Z výhně stoupá žár, z kladiva zvoní ocel.'),
('Sýpka', 'economic', 'Ukládá zásoby obilí pro období nouze.', 6, 4, 0, 5, 1, 'HAMLET', '{"food_income": 2, "stability_bonus": 3}', 'Plná sýpka znamená klidné zimní noci.'),
-- Military
('Kasárna', 'military', 'Výcvikové centrum pro vojáky.', 6, 4, 3, 15, 2, 'TOWNSHIP', '{"manpower_bonus": 20, "defense_bonus": 5}', 'Cvičení v míru, vítězství ve válce.'),
('Hradby', 'military', 'Kamenné opevnění města.', 2, 15, 3, 20, 3, 'TOWNSHIP', '{"defense_bonus": 25, "stability_bonus": 5}', 'Za těmito zdmi se nepřítel zastaví.'),
('Zbrojnice', 'military', 'Sklad zbraní a výstroje.', 5, 3, 8, 10, 2, 'CITY', '{"manpower_bonus": 10, "iron_income": 1}', 'Každý meč má své místo, každý štít svůj háček.'),
-- Cultural
('Divadlo', 'cultural', 'Místo umění, zábavy a kultury.', 8, 5, 0, 15, 2, 'TOWNSHIP', '{"stability_bonus": 8, "influence_bonus": 5, "population_growth": 1}', 'Masky a příběhy spojují lid.'),
('Knihovna', 'cultural', 'Středisko vědění a moudrosti.', 6, 3, 1, 20, 2, 'CITY', '{"influence_bonus": 8, "stability_bonus": 3}', 'Pergameny nesou paměť generací.'),
-- Religious
('Chrám', 'religious', 'Posvátné místo uctívání bohů.', 5, 10, 0, 25, 3, 'TOWNSHIP', '{"stability_bonus": 10, "influence_bonus": 5, "population_growth": 0.5}', 'Zvony svolávají lid k modlitbě.'),
('Svatyně', 'religious', 'Malé místo klidu a rozjímání.', 3, 2, 0, 5, 1, 'HAMLET', '{"stability_bonus": 5, "population_growth": 0.3}', 'I v tichu lze uslyšet hlas bohů.'),
-- Infrastructure
('Silnice', 'infrastructure', 'Zpevněná cesta usnadňující obchod a pohyb.', 4, 6, 0, 8, 1, 'HAMLET', '{"wealth_income": 2, "population_growth": 0.5}', 'Kudy vede cesta, tudy proudí zlato.'),
('Akvadukt', 'infrastructure', 'Přivádí čistou vodu do města.', 3, 12, 2, 18, 3, 'CITY', '{"population_growth": 2, "stability_bonus": 5, "food_income": 1}', 'Voda je život, a my ji přivedli.'),
('Přístav', 'infrastructure', 'Umožňuje námořní obchod a rybolov.', 10, 5, 3, 20, 2, 'TOWNSHIP', '{"wealth_income": 4, "food_income": 2, "influence_bonus": 3}', 'Lodě přinášejí bohatství z dalekých zemí.');

-- ═══════════════════════════════════════════
-- CITY BUILDINGS (instances built in cities)
-- ═══════════════════════════════════════════
CREATE TABLE public.city_buildings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  city_id UUID NOT NULL REFERENCES public.cities(id),
  template_id UUID REFERENCES public.building_templates(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'economic',
  description TEXT NOT NULL DEFAULT '',
  flavor_text TEXT,
  cost_wood INTEGER NOT NULL DEFAULT 0,
  cost_stone INTEGER NOT NULL DEFAULT 0,
  cost_iron INTEGER NOT NULL DEFAULT 0,
  cost_wealth INTEGER NOT NULL DEFAULT 0,
  effects JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  image_prompt TEXT,
  founding_myth TEXT,
  status TEXT NOT NULL DEFAULT 'building',
  build_started_turn INTEGER NOT NULL DEFAULT 1,
  build_duration INTEGER NOT NULL DEFAULT 1,
  completed_turn INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.city_buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to city buildings" ON public.city_buildings FOR ALL USING (true) WITH CHECK (true);

-- Index for fast city lookups
CREATE INDEX idx_city_buildings_city ON public.city_buildings(city_id);
CREATE INDEX idx_city_buildings_session ON public.city_buildings(session_id);
