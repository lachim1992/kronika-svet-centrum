
-- ═══════════════════════════════════════════════════
-- BUILDING UPGRADE SYSTEM: 3 levels for templates, 5 for AI
-- ═══════════════════════════════════════════════════

-- 1. Add level system to building_templates
ALTER TABLE public.building_templates
  ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS level_data jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Add level tracking to city_buildings  
ALTER TABLE public.city_buildings
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS level_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_wonder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wonder_id uuid;

-- 3. Nullify FK references so we can replace templates
UPDATE public.city_buildings SET template_id = NULL WHERE template_id IS NOT NULL;

-- 4. Delete old templates and insert fresh 30 with level data
DELETE FROM public.building_templates;

-- ═══════ ECONOMIC (10) ═══════
INSERT INTO public.building_templates (name, category, description, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, max_level, effects, level_data) VALUES
('Farma', 'economic', 'Základní zemědělská usedlost zásobující město obilím.', 15, 5, 0, 10, 1, 'HAMLET', 3,
  '{"grain_production": 8}',
  '[{"level":1,"name":"Farma","effects":{"grain_production":8},"cost_mult":1},{"level":2,"name":"Velkostatek","effects":{"grain_production":14,"population_capacity":50},"cost_mult":2,"unlock":"Kapacita populace +50"},{"level":3,"name":"Královské panství","effects":{"grain_production":22,"population_capacity":120,"stability":3},"cost_mult":4,"unlock":"Stabilita +3"}]'),
('Důl', 'economic', 'Hlubinný důl těžící kovy a kámen.', 20, 10, 5, 15, 2, 'HAMLET', 3,
  '{"iron_production": 5, "stone_production": 5}',
  '[{"level":1,"name":"Důl","effects":{"iron_production":5,"stone_production":5},"cost_mult":1},{"level":2,"name":"Štola","effects":{"iron_production":10,"stone_production":8},"cost_mult":2,"unlock":"Dvojnásobná těžba železa"},{"level":3,"name":"Královský důl","effects":{"iron_production":18,"stone_production":14,"wealth":5},"cost_mult":4,"unlock":"Zlato z drahých kovů (+5)"}]'),
('Pila', 'economic', 'Zpracovávna dřeva pro stavební účely.', 10, 5, 5, 10, 1, 'HAMLET', 3,
  '{"wood_production": 8}',
  '[{"level":1,"name":"Pila","effects":{"wood_production":8},"cost_mult":1},{"level":2,"name":"Tesařská dílna","effects":{"wood_production":14,"build_speed":1},"cost_mult":2,"unlock":"Urychlení staveb o 1 kolo"},{"level":3,"name":"Královská tesárna","effects":{"wood_production":22,"build_speed":2,"defense":2},"cost_mult":4,"unlock":"Obranné palisády (+2 obrana)"}]'),
('Tržiště', 'economic', 'Centrum obchodu přitahující kupce.', 20, 15, 0, 25, 2, 'VILLAGE', 3,
  '{"wealth": 8, "influence": 2}',
  '[{"level":1,"name":"Tržiště","effects":{"wealth":8,"influence":2},"cost_mult":1},{"level":2,"name":"Obchodní dům","effects":{"wealth":16,"influence":5,"burgher_attraction":20},"cost_mult":2,"unlock":"Přitahuje měšťany (+20)"},{"level":3,"name":"Velká tržnice","effects":{"wealth":28,"influence":10,"burgher_attraction":50,"trade_bonus":15},"cost_mult":4,"unlock":"Obchodní bonus +15%"}]'),
('Přístav', 'economic', 'Námořní brána pro obchod a rybolov.', 30, 20, 10, 30, 3, 'VILLAGE', 3,
  '{"wealth": 10, "grain_production": 4}',
  '[{"level":1,"name":"Přístav","effects":{"wealth":10,"grain_production":4},"cost_mult":1},{"level":2,"name":"Obchodní přístaviště","effects":{"wealth":20,"grain_production":8,"trade_bonus":10},"cost_mult":2,"unlock":"Námořní obchodní cesty (+10%)"},{"level":3,"name":"Královský přístav","effects":{"wealth":35,"grain_production":12,"trade_bonus":25,"naval_power":5},"cost_mult":4,"unlock":"Námořní síla +5"}]'),
('Sýpka', 'economic', 'Skladiště obilí chránící před hladomorem.', 15, 10, 0, 10, 1, 'HAMLET', 3,
  '{"granary_capacity": 200}',
  '[{"level":1,"name":"Sýpka","effects":{"granary_capacity":200},"cost_mult":1},{"level":2,"name":"Velká sýpka","effects":{"granary_capacity":500,"famine_resistance":1},"cost_mult":2,"unlock":"Odolnost vůči hladomoru +1"},{"level":3,"name":"Královská zásobárna","effects":{"granary_capacity":1000,"famine_resistance":3,"stability":5},"cost_mult":4,"unlock":"Stabilita +5"}]'),
('Manufaktura', 'economic', 'Řemeslnická dílna zvyšující produkci.', 25, 15, 10, 20, 2, 'VILLAGE', 3,
  '{"production_bonus": 10}',
  '[{"level":1,"name":"Manufaktura","effects":{"production_bonus":10},"cost_mult":1},{"level":2,"name":"Velká manufaktura","effects":{"production_bonus":20,"wealth":5},"cost_mult":2,"unlock":"Luxusní zboží (+5 zlata)"},{"level":3,"name":"Královská manufaktura","effects":{"production_bonus":35,"wealth":12,"influence":5},"cost_mult":4,"unlock":"Prestiž řemesla (+5 vliv)"}]'),
('Kovárna', 'economic', 'Zpracování kovů pro zbraně i nástroje.', 20, 10, 15, 15, 2, 'HAMLET', 3,
  '{"iron_production": 6, "military_quality": 2}',
  '[{"level":1,"name":"Kovárna","effects":{"iron_production":6,"military_quality":2},"cost_mult":1},{"level":2,"name":"Zbrojnice","effects":{"iron_production":12,"military_quality":5,"defense":2},"cost_mult":2,"unlock":"Obrana města +2"},{"level":3,"name":"Královská zbrojírna","effects":{"iron_production":20,"military_quality":10,"defense":5,"recruitment_bonus":3},"cost_mult":4,"unlock":"Rekrutační bonus +3"}]'),
('Sklárna', 'economic', 'Výroba skla a uměleckých předmětů.', 20, 15, 5, 20, 2, 'VILLAGE', 3,
  '{"wealth": 6, "influence": 3}',
  '[{"level":1,"name":"Sklárna","effects":{"wealth":6,"influence":3},"cost_mult":1},{"level":2,"name":"Umělecká sklárna","effects":{"wealth":14,"influence":7,"stability":2},"cost_mult":2,"unlock":"Stabilita +2 (krása)"},{"level":3,"name":"Královská sklárna","effects":{"wealth":24,"influence":12,"stability":5,"special_production":3},"cost_mult":4,"unlock":"Speciální produkce +3"}]'),
('Mincovna', 'economic', 'Ražba vlastních mincí posilující ekonomiku.', 30, 20, 20, 40, 3, 'TOWN', 3,
  '{"wealth": 15}',
  '[{"level":1,"name":"Mincovna","effects":{"wealth":15},"cost_mult":1},{"level":2,"name":"Královská mincovna","effects":{"wealth":30,"legitimacy":5},"cost_mult":2,"unlock":"Legitimita +5 (vlastní měna)"},{"level":3,"name":"Říšská pokladnice","effects":{"wealth":50,"legitimacy":10,"influence":8,"trade_bonus":10},"cost_mult":4,"unlock":"Obchodní bonus +10%, vliv +8"}]'),

-- ═══════ MILITARY (8) ═══════
('Kasárny', 'military', 'Výcviková základna pro vojáky.', 25, 15, 10, 20, 2, 'HAMLET', 3,
  '{"recruitment": 5, "military_garrison": 10}',
  '[{"level":1,"name":"Kasárny","effects":{"recruitment":5,"military_garrison":10},"cost_mult":1},{"level":2,"name":"Výcvikový tábor","effects":{"recruitment":10,"military_garrison":25,"military_quality":3},"cost_mult":2,"unlock":"Kvalita vojáků +3"},{"level":3,"name":"Válečná akademie","effects":{"recruitment":18,"military_garrison":50,"military_quality":8,"morale_bonus":5},"cost_mult":4,"unlock":"Morálka +5"}]'),
('Hradby', 'military', 'Kamenné opevnění chránící město.', 30, 30, 10, 25, 3, 'VILLAGE', 3,
  '{"defense": 10, "stability": 3}',
  '[{"level":1,"name":"Hradby","effects":{"defense":10,"stability":3},"cost_mult":1},{"level":2,"name":"Dvojité hradby","effects":{"defense":22,"stability":6,"siege_resistance":5},"cost_mult":2,"unlock":"Odolnost obléhání +5"},{"level":3,"name":"Nedobytná citadela","effects":{"defense":40,"stability":10,"siege_resistance":15,"military_garrison":20},"cost_mult":4,"unlock":"Posádka +20"}]'),
('Strážní věž', 'military', 'Pozorovatelna hlídající okolí.', 15, 10, 5, 10, 1, 'HAMLET', 3,
  '{"defense": 3, "vision": 2}',
  '[{"level":1,"name":"Strážní věž","effects":{"defense":3,"vision":2},"cost_mult":1},{"level":2,"name":"Hlídková věž","effects":{"defense":7,"vision":4,"espionage_defense":3},"cost_mult":2,"unlock":"Obrana proti špionáži +3"},{"level":3,"name":"Orlí hnízdo","effects":{"defense":12,"vision":6,"espionage_defense":8},"cost_mult":4,"unlock":"Včasné varování"}]'),
('Obléhací dílna', 'military', 'Výroba obléhacích strojů.', 25, 15, 20, 20, 2, 'TOWN', 3,
  '{"siege_power": 5}',
  '[{"level":1,"name":"Obléhací dílna","effects":{"siege_power":5},"cost_mult":1},{"level":2,"name":"Válečná dílna","effects":{"siege_power":12,"military_quality":3},"cost_mult":2,"unlock":"Kvalita strojů +3"},{"level":3,"name":"Arsenal","effects":{"siege_power":22,"military_quality":7,"defense":5},"cost_mult":4,"unlock":"Obranné stroje (+5 obrana)"}]'),
('Jízdárna', 'military', 'Výcvik jízdních jednotek.', 25, 10, 10, 20, 2, 'VILLAGE', 3,
  '{"cavalry_bonus": 5, "mobility": 2}',
  '[{"level":1,"name":"Jízdárna","effects":{"cavalry_bonus":5,"mobility":2},"cost_mult":1},{"level":2,"name":"Královské stáje","effects":{"cavalry_bonus":12,"mobility":4,"recruitment":3},"cost_mult":2,"unlock":"Rekrutace jezdců +3"},{"level":3,"name":"Elitní jízdní škola","effects":{"cavalry_bonus":22,"mobility":6,"recruitment":6,"morale_bonus":5},"cost_mult":4,"unlock":"Morálka jízdy +5"}]'),
('Střelnice', 'military', 'Výcvik lukostřelců.', 15, 5, 10, 15, 1, 'HAMLET', 3,
  '{"ranged_bonus": 5}',
  '[{"level":1,"name":"Střelnice","effects":{"ranged_bonus":5},"cost_mult":1},{"level":2,"name":"Lukostřelecký výcvik","effects":{"ranged_bonus":12,"defense":3},"cost_mult":2,"unlock":"Obranná střelba +3"},{"level":3,"name":"Mistrovská střelnice","effects":{"ranged_bonus":22,"defense":7,"military_quality":4},"cost_mult":4,"unlock":"Kvalita střelců +4"}]'),
('Velitelství', 'military', 'Centrum vojenského plánování.', 30, 20, 15, 30, 3, 'TOWN', 3,
  '{"military_quality": 5, "morale_bonus": 3}',
  '[{"level":1,"name":"Velitelství","effects":{"military_quality":5,"morale_bonus":3},"cost_mult":1},{"level":2,"name":"Válečná rada","effects":{"military_quality":10,"morale_bonus":7,"recruitment":5},"cost_mult":2,"unlock":"Strategická koordinace (+5 rekrutace)"},{"level":3,"name":"Říšský generální štáb","effects":{"military_quality":18,"morale_bonus":12,"recruitment":10,"influence":5},"cost_mult":4,"unlock":"Vojenský vliv +5"}]'),
('Pevnost', 'military', 'Masivní kamenná fortifikace.', 40, 35, 20, 35, 4, 'TOWN', 3,
  '{"defense": 15, "military_garrison": 15}',
  '[{"level":1,"name":"Pevnost","effects":{"defense":15,"military_garrison":15},"cost_mult":1},{"level":2,"name":"Královská pevnost","effects":{"defense":30,"military_garrison":35,"siege_resistance":10},"cost_mult":2,"unlock":"Odolnost obléhání +10"},{"level":3,"name":"Neprůstřelná bašta","effects":{"defense":50,"military_garrison":60,"siege_resistance":25,"stability":8},"cost_mult":4,"unlock":"Stabilita +8 (symbol moci)"}]'),

-- ═══════ CULTURAL (6) ═══════
('Chrám', 'cultural', 'Posvátné místo modlitby.', 20, 15, 0, 20, 2, 'HAMLET', 3,
  '{"stability": 5, "legitimacy": 3, "cleric_attraction": 10}',
  '[{"level":1,"name":"Chrám","effects":{"stability":5,"legitimacy":3,"cleric_attraction":10},"cost_mult":1},{"level":2,"name":"Katedrála","effects":{"stability":10,"legitimacy":8,"cleric_attraction":25,"influence":5},"cost_mult":2,"unlock":"Vliv +5 (náboženské centrum)"},{"level":3,"name":"Velká katedrála","effects":{"stability":18,"legitimacy":15,"cleric_attraction":50,"influence":12,"disease_resistance":3},"cost_mult":4,"unlock":"Zázračné uzdravení (+3 nemoci)"}]'),
('Knihovna', 'cultural', 'Sbírka svitků rozšiřující poznání.', 20, 10, 0, 25, 2, 'VILLAGE', 3,
  '{"influence": 5, "research": 3}',
  '[{"level":1,"name":"Knihovna","effects":{"influence":5,"research":3},"cost_mult":1},{"level":2,"name":"Velká knihovna","effects":{"influence":12,"research":8,"legitimacy":5},"cost_mult":2,"unlock":"Legitimita +5 (vzdělání)"},{"level":3,"name":"Královská akademie","effects":{"influence":22,"research":15,"legitimacy":10,"espionage_defense":5},"cost_mult":4,"unlock":"Obrana šifrováním +5"}]'),
('Divadlo', 'cultural', 'Místo kulturních představení.', 15, 10, 0, 20, 2, 'VILLAGE', 3,
  '{"stability": 4, "influence": 3}',
  '[{"level":1,"name":"Divadlo","effects":{"stability":4,"influence":3},"cost_mult":1},{"level":2,"name":"Amfiteátr","effects":{"stability":9,"influence":8,"burgher_attraction":15},"cost_mult":2,"unlock":"Přitahuje měšťany +15"},{"level":3,"name":"Královské divadlo","effects":{"stability":16,"influence":15,"burgher_attraction":35,"legitimacy":5},"cost_mult":4,"unlock":"Legitimita +5 (kulturní prestiž)"}]'),
('Klášter', 'cultural', 'Centrum duchovního života.', 25, 20, 0, 20, 3, 'VILLAGE', 3,
  '{"stability": 6, "cleric_attraction": 15, "disease_resistance": 2}',
  '[{"level":1,"name":"Klášter","effects":{"stability":6,"cleric_attraction":15,"disease_resistance":2},"cost_mult":1},{"level":2,"name":"Opatství","effects":{"stability":12,"cleric_attraction":30,"disease_resistance":5,"grain_production":4},"cost_mult":2,"unlock":"Klášterní zahrady (+4 obilí)"},{"level":3,"name":"Arciopatství","effects":{"stability":20,"cleric_attraction":50,"disease_resistance":8,"grain_production":8,"influence":8},"cost_mult":4,"unlock":"Poutní místo (+8 vliv)"}]'),
('Soudní dvůr', 'cultural', 'Centrum spravedlnosti.', 25, 15, 5, 25, 2, 'TOWN', 3,
  '{"legitimacy": 8, "stability": 4}',
  '[{"level":1,"name":"Soudní dvůr","effects":{"legitimacy":8,"stability":4},"cost_mult":1},{"level":2,"name":"Říšský soud","effects":{"legitimacy":16,"stability":8,"influence":5},"cost_mult":2,"unlock":"Vliv spravedlnosti +5"},{"level":3,"name":"Nejvyšší tribunál","effects":{"legitimacy":28,"stability":14,"influence":12,"espionage_defense":5},"cost_mult":4,"unlock":"Obrana proti korupci +5"}]'),
('Bardův dům', 'cultural', 'Sídlo bardů a vypravěčů.', 15, 10, 0, 15, 1, 'HAMLET', 3,
  '{"influence": 4, "stability": 2}',
  '[{"level":1,"name":"Bardův dům","effects":{"influence":4,"stability":2},"cost_mult":1},{"level":2,"name":"Dům legend","effects":{"influence":10,"stability":5,"morale_bonus":3},"cost_mult":2,"unlock":"Válečné písně (+3 morálka)"},{"level":3,"name":"Pantheon příběhů","effects":{"influence":18,"stability":10,"morale_bonus":7,"legitimacy":5},"cost_mult":4,"unlock":"Legendární pověst (+5 legitimita)"}]'),

-- ═══════ INFRASTRUCTURE (6) ═══════
('Akvadukt', 'infrastructure', 'Přívod čisté vody do města.', 25, 25, 5, 20, 3, 'VILLAGE', 3,
  '{"population_capacity": 100, "disease_resistance": 3}',
  '[{"level":1,"name":"Akvadukt","effects":{"population_capacity":100,"disease_resistance":3},"cost_mult":1},{"level":2,"name":"Velký akvadukt","effects":{"population_capacity":250,"disease_resistance":6,"grain_production":3},"cost_mult":2,"unlock":"Zavlažování (+3 obilí)"},{"level":3,"name":"Říšský vodovod","effects":{"population_capacity":500,"disease_resistance":10,"grain_production":8,"stability":5},"cost_mult":4,"unlock":"Stabilita +5 (čistá voda)"}]'),
('Silnice', 'infrastructure', 'Zpevněné cesty propojující město.', 15, 15, 0, 15, 2, 'HAMLET', 3,
  '{"trade_bonus": 5, "mobility": 2}',
  '[{"level":1,"name":"Silnice","effects":{"trade_bonus":5,"mobility":2},"cost_mult":1},{"level":2,"name":"Dlážděná cesta","effects":{"trade_bonus":12,"mobility":4,"wealth":3},"cost_mult":2,"unlock":"Mýtné (+3 zlata)"},{"level":3,"name":"Královská silnice","effects":{"trade_bonus":22,"mobility":6,"wealth":8,"recruitment":3},"cost_mult":4,"unlock":"Rychlá mobilizace (+3 rekrutace)"}]'),
('Kanalizace', 'infrastructure', 'Odvodňovací systém snižující nemoci.', 20, 20, 5, 20, 2, 'TOWN', 3,
  '{"disease_resistance": 5, "population_capacity": 80}',
  '[{"level":1,"name":"Kanalizace","effects":{"disease_resistance":5,"population_capacity":80},"cost_mult":1},{"level":2,"name":"Městská stoka","effects":{"disease_resistance":10,"population_capacity":200,"stability":3},"cost_mult":2,"unlock":"Stabilita +3 (čistota)"},{"level":3,"name":"Velký odvodňovací systém","effects":{"disease_resistance":18,"population_capacity":400,"stability":7},"cost_mult":4,"unlock":"Imunita epidemií"}]'),
('Studna', 'infrastructure', 'Základní zdroj pitné vody.', 5, 5, 0, 5, 1, 'HAMLET', 3,
  '{"population_capacity": 50, "disease_resistance": 1}',
  '[{"level":1,"name":"Studna","effects":{"population_capacity":50,"disease_resistance":1},"cost_mult":1},{"level":2,"name":"Kamenná cisterna","effects":{"population_capacity":120,"disease_resistance":3,"famine_resistance":1},"cost_mult":2,"unlock":"Odolnost hladomoru +1"},{"level":3,"name":"Artézská studna","effects":{"population_capacity":250,"disease_resistance":5,"famine_resistance":3,"grain_production":3},"cost_mult":4,"unlock":"Zavlažování (+3 obilí)"}]'),
('Most', 'infrastructure', 'Překlenuje překážky.', 20, 20, 10, 15, 2, 'VILLAGE', 3,
  '{"trade_bonus": 6, "defense": 3}',
  '[{"level":1,"name":"Most","effects":{"trade_bonus":6,"defense":3},"cost_mult":1},{"level":2,"name":"Kamenný most","effects":{"trade_bonus":14,"defense":7,"wealth":4},"cost_mult":2,"unlock":"Mýtné z mostu (+4 zlata)"},{"level":3,"name":"Velký královský most","effects":{"trade_bonus":25,"defense":12,"wealth":10,"influence":5},"cost_mult":4,"unlock":"Symbol prosperity (+5 vliv)"}]'),
('Lázně', 'infrastructure', 'Očistné lázně pro zdraví obyvatel.', 20, 15, 0, 20, 2, 'VILLAGE', 3,
  '{"disease_resistance": 4, "stability": 3}',
  '[{"level":1,"name":"Lázně","effects":{"disease_resistance":4,"stability":3},"cost_mult":1},{"level":2,"name":"Římské lázně","effects":{"disease_resistance":8,"stability":7,"burgher_attraction":15},"cost_mult":2,"unlock":"Přitahuje měšťany +15"},{"level":3,"name":"Královské termy","effects":{"disease_resistance":14,"stability":12,"burgher_attraction":35,"influence":5,"legitimacy":3},"cost_mult":4,"unlock":"Luxusní životní styl (+5 vliv, +3 legitimita)"}]');
