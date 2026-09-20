-- 1) New raw good for incense/resin gathering (semantic fix: gather_incense produced raw_ore)
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, storable, icon, description, friction_profile)
SELECT 'raw_incense', 'Pryskyřice a kadidlo', 'raw_material', 'raw', 'mass', 1, 1.2, 'admin_supplies', true, '🌿', 'Sbíraná pryskyřice a aromatické smoly pro rituální výrobu.', '{"final_use": false, "household": false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.goods WHERE key = 'raw_incense');

UPDATE public.production_recipes SET output_good_key = 'raw_incense', output_quantity = 2,
  description = 'Sběr pryskyřice a kadidlových smol.'
WHERE recipe_key = 'gather_incense';

UPDATE public.production_recipes SET input_items = '[{"key": "raw_incense", "qty": 1}, {"key": "olive_oil", "qty": 1}]'::jsonb
WHERE recipe_key = 'craft_ritual';

-- 2) Explicit final-use / household metadata per good (industrial intermediates are not household goods)
WITH meta(key, final_use, household) AS (VALUES
  ('raw_grain', true, true), ('raw_fish', true, false), ('raw_meat', true, false),
  ('raw_olives', false, false), ('raw_grapes', false, false), ('raw_fiber', false, false),
  ('raw_hide', false, false), ('raw_ore', false, false), ('raw_stone', false, false),
  ('raw_timber', false, false), ('raw_incense', false, false), ('peat', true, true),
  ('well_water', true, true), ('charcoal', true, false), ('flour', false, false),
  ('yarn', false, false), ('leather', false, false), ('iron_ingot', false, false),
  ('copper_ingot', false, false), ('lumber', true, false), ('stone_blocks', true, false),
  ('olive_oil', true, false), ('granary_storage', true, false), ('scribed_documents', true, false),
  ('baked_staples', true, false), ('baked_refined', true, false), ('preserved_food', true, false),
  ('textile_basic', true, true), ('textile_fine', true, false), ('metalwork_tools', true, true),
  ('construction_materials', true, false), ('pottery', true, false), ('arms_basic', true, false),
  ('wine_standard', true, false), ('feast_goods', true, false), ('wine_luxury', true, false),
  ('fine_arms', true, false), ('jewelry', true, false), ('ritual_goods', true, false))
UPDATE public.goods g
SET friction_profile = g.friction_profile || jsonb_build_object('final_use', m.final_use, 'household', m.household)
FROM meta m WHERE g.key = m.key;

-- raw grain must not compete one to one with bread
UPDATE public.goods SET friction_profile = friction_profile || '{"substitutability": 0.3}'::jsonb WHERE key = 'raw_grain';

-- 3) Explicit production contract on building templates (idempotent upsert by name)
DO $$
DECLARE
  spec jsonb := '[
    {"name":"Farma","category":"economic","roles":["source"],"tags":["farming","herding"],"baskets":{"staple_food":5},
     "costs":[10,15,5,0],"turns":1,"req":"HAMLET","description":"Polnosti a pastviny — zdroj obilí, vláken a dobytka.",
     "levels":[{"name":"Farma","cost_mult":1,"recipes":["harvest_wheat","harvest_barley","herd_cattle"]},
               {"name":"Velkostatek","cost_mult":2,"recipes":["harvest_rice","harvest_flax","herd_sheep"]},
               {"name":"Královské panství","cost_mult":4,"recipes":["skin_cattle","harvest_olives"]}]},
    {"name":"Rybářství","category":"economic","roles":["source"],"tags":["fishing"],"baskets":{"staple_food":4},
     "requires_water":true,"costs":[10,15,5,0],"turns":1,"req":"HAMLET","description":"Rybářské přístaviště — lov ryb u pobřeží nebo na řece.",
     "levels":[{"name":"Rybářství","cost_mult":1,"recipes":["catch_fish"]},
               {"name":"Rybářská osada","cost_mult":2,"recipes":[]},
               {"name":"Velký rybolov","cost_mult":4,"recipes":[]}]},
    {"name":"Důl","category":"economic","roles":["source"],"tags":["mining"],"baskets":{"metalwork":4,"construction":1},
     "costs":[15,20,10,5],"turns":2,"req":"HAMLET","description":"Těžba rudy. Ingoty a nástroje se kovají jinde.",
     "levels":[{"name":"Důl","cost_mult":1,"recipes":["mine_iron"]},
               {"name":"Štola","cost_mult":2,"recipes":["mine_copper"]},
               {"name":"Královský důl","cost_mult":4,"recipes":["mine_gold"]}]},
    {"name":"Kamenolom","category":"economic","roles":["source"],"tags":["quarrying"],"baskets":{"construction":4},
     "costs":[12,15,5,5],"turns":2,"req":"HAMLET","description":"Lámání kamene a mramoru.",
     "levels":[{"name":"Kamenolom","cost_mult":1,"recipes":["quarry_stone"]},
               {"name":"Velký lom","cost_mult":2,"recipes":[]},
               {"name":"Mramorový lom","cost_mult":4,"recipes":["quarry_marble"]}]},
    {"name":"Dřevorubecký tábor","category":"economic","roles":["source"],"tags":["logging"],"baskets":{"construction":4},
     "costs":[10,10,5,5],"turns":1,"req":"HAMLET","description":"Kácení surového dřeva pro pily a stavby.",
     "levels":[{"name":"Dřevorubecký tábor","cost_mult":1,"recipes":["fell_timber"]},
               {"name":"Lesní dvůr","cost_mult":2,"recipes":[]},
               {"name":"Cedrová těžba","cost_mult":4,"recipes":["fell_cedar"]}]},
    {"name":"Vinice","category":"economic","roles":["source"],"tags":["farming","viticulture"],"baskets":{"feast":3},
     "costs":[15,10,5,0],"turns":2,"req":"HAMLET","description":"Vinohrady — hrozny pro vinařství.",
     "levels":[{"name":"Vinice","cost_mult":1,"recipes":["harvest_grapes"]},
               {"name":"Panská vinice","cost_mult":2,"recipes":[]},
               {"name":"Slavná vinice","cost_mult":4,"recipes":[]}]},
    {"name":"Rašeliniště","category":"economic","roles":["producer","source"],"tags":["gathering"],"baskets":{"fuel":3},
     "costs":[8,10,5,0],"turns":1,"req":"HAMLET","description":"Řez rašeliny a sběr pryskyřice.",
     "levels":[{"name":"Rašeliniště","cost_mult":1,"recipes":["cut_peat"]},
               {"name":"Rašeliniště a sběračská stanice","cost_mult":2,"recipes":["gather_incense"]},
               {"name":"Velké rašeliniště","cost_mult":4,"recipes":[]}]},
    {"name":"Studna","category":"infrastructure","roles":["producer"],"tags":["farming"],"baskets":{"drinking_water":6},
     "costs":[5,5,5,0],"turns":1,"req":"HAMLET","description":"Zdroj pitné vody.",
     "levels":[{"name":"Studna","cost_mult":1,"recipes":["draw_water"]},
               {"name":"Hluboká studna","cost_mult":2,"recipes":[]},
               {"name":"Cisterna","cost_mult":4,"recipes":[]}]},
    {"name":"Akvadukt","category":"infrastructure","roles":["producer"],"tags":["farming"],"baskets":{"drinking_water":8},
     "costs":[20,25,25,5],"turns":3,"req":"VILLAGE","description":"Přivádí pitnou vodu do města.",
     "levels":[{"name":"Akvadukt","cost_mult":1,"recipes":["draw_water"]},
               {"name":"Velký akvadukt","cost_mult":2,"recipes":[]},
               {"name":"Královský akvadukt","cost_mult":4,"recipes":[]}]},
    {"name":"Mlýn","category":"economic","roles":["processing"],"tags":["milling"],"baskets":{"staple_food":4},
     "costs":[15,15,10,5],"turns":2,"req":"HAMLET","description":"Mele obilí na mouku.",
     "levels":[{"name":"Mlýn","cost_mult":1,"recipes":["mill_grain"]},
               {"name":"Vodní mlýn","cost_mult":2,"recipes":[]},
               {"name":"Velký mlýn","cost_mult":4,"recipes":[]}]},
    {"name":"Udírna a solírna","category":"economic","roles":["processing"],"tags":["preserving"],"baskets":{"staple_food":3},
     "costs":[15,15,10,0],"turns":2,"req":"HAMLET","description":"Sušení, solení a uzení potravin.",
     "levels":[{"name":"Udírna a solírna","cost_mult":1,"recipes":["preserve_food"]},
               {"name":"Velká solírna","cost_mult":2,"recipes":["preserve_fish"]},
               {"name":"Zásobárna zásob","cost_mult":4,"recipes":[]}]},
    {"name":"Koželužna","category":"economic","roles":["processing"],"tags":["tanning"],"baskets":{"basic_clothing":3},
     "costs":[15,15,10,5],"turns":2,"req":"HAMLET","description":"Činí kůže na koženou surovinu.",
     "levels":[{"name":"Koželužna","cost_mult":1,"recipes":["tan_leather"]},
               {"name":"Velká koželužna","cost_mult":2,"recipes":[]},
               {"name":"Cechovní koželužna","cost_mult":4,"recipes":[]}]},
    {"name":"Přádelna","category":"economic","roles":["processing"],"tags":["spinning"],"baskets":{"basic_clothing":3},
     "costs":[15,15,10,0],"turns":2,"req":"HAMLET","description":"Přede vlákna na přízi.",
     "levels":[{"name":"Přádelna","cost_mult":1,"recipes":["spin_yarn"]},
               {"name":"Velká přádelna","cost_mult":2,"recipes":[]},
               {"name":"Cechovní přádelna","cost_mult":4,"recipes":[]}]},
    {"name":"Huť","category":"economic","roles":["processing"],"tags":["smelting"],"baskets":{"metalwork":4},
     "costs":[20,20,15,10],"turns":2,"req":"VILLAGE","description":"Taví rudu na železné a měděné ingoty.",
     "levels":[{"name":"Huť","cost_mult":1,"recipes":["smelt_iron"]},
               {"name":"Velká huť","cost_mult":2,"recipes":["smelt_copper"]},
               {"name":"Královská huť","cost_mult":4,"recipes":[]}]},
    {"name":"Pila","category":"economic","roles":["processing"],"tags":["sawing"],"baskets":{"construction":4,"fuel":2},
     "costs":[10,10,5,5],"turns":1,"req":"HAMLET","description":"Řeže surové dřevo na řezivo. Dřevo sama nevytváří.",
     "levels":[{"name":"Pila","cost_mult":1,"recipes":["saw_timber"]},
               {"name":"Tesařská dílna","cost_mult":2,"recipes":[]},
               {"name":"Královská tesárna","cost_mult":4,"recipes":[]}]},
    {"name":"Kamenictví","category":"economic","roles":["processing"],"tags":["stonecutting"],"baskets":{"construction":4},
     "costs":[15,10,15,5],"turns":2,"req":"HAMLET","description":"Řeže kamenné bloky.",
     "levels":[{"name":"Kamenictví","cost_mult":1,"recipes":["cut_stone"]},
               {"name":"Velká kamenická dílna","cost_mult":2,"recipes":[]},
               {"name":"Cechovní kamenictví","cost_mult":4,"recipes":[]}]},
    {"name":"Lisovna oleje","category":"economic","roles":["processing"],"tags":["pressing"],"baskets":{"feast":3},
     "costs":[15,15,10,0],"turns":2,"req":"HAMLET","description":"Lisuje olivy na olej.",
     "levels":[{"name":"Lisovna oleje","cost_mult":1,"recipes":["press_olives"]},
               {"name":"Velká lisovna","cost_mult":2,"recipes":[]},
               {"name":"Cechovní lisovna","cost_mult":4,"recipes":[]}]},
    {"name":"Uhlířství","category":"economic","roles":["producer"],"tags":["logging"],"baskets":{"fuel":3},
     "costs":[10,10,5,0],"turns":1,"req":"HAMLET","description":"Pálí dřevěné uhlí.",
     "levels":[{"name":"Uhlířství","cost_mult":1,"recipes":["burn_charcoal"]},
               {"name":"Uhlířská osada","cost_mult":2,"recipes":[]},
               {"name":"Velké milíře","cost_mult":4,"recipes":[]}]},
    {"name":"Písařská dílna","category":"economic","roles":["producer"],"tags":["crafting"],"baskets":{"admin_supplies":3},
     "costs":[20,15,10,0],"turns":2,"req":"VILLAGE","description":"Vyrábí pergameny a úřední listiny.",
     "levels":[{"name":"Písařská dílna","cost_mult":1,"recipes":["scribe_documents"]},
               {"name":"Skriptorium","cost_mult":2,"recipes":[]},
               {"name":"Královská kancelář","cost_mult":4,"recipes":[]}]},
    {"name":"Sýpka","category":"economic","roles":["producer"],"tags":["construction"],"baskets":{"storage_logistics":4,"staple_food":2},
     "costs":[10,15,10,0],"turns":1,"req":"HAMLET","description":"Skladová kapacita a zásobní hospodářství.",
     "levels":[{"name":"Sýpka","cost_mult":1,"recipes":["build_granary"]},
               {"name":"Velká sýpka","cost_mult":2,"recipes":[]},
               {"name":"Královská zásobárna","cost_mult":4,"recipes":[]}]},
    {"name":"Pekárna","category":"economic","roles":["urban","guild"],"tags":["baking","master_craft"],"baskets":{"staple_food":5},
     "costs":[15,15,10,0],"turns":2,"req":"HAMLET","description":"Peče chléb, pečivo a slavnostní tabule.",
     "levels":[{"name":"Pekárna","cost_mult":1,"recipes":["bake_staples"]},
               {"name":"Městská pekárna","cost_mult":2,"recipes":["bake_refined"]},
               {"name":"Hodovní kuchyně","cost_mult":4,"recipes":["prepare_feast"]}]},
    {"name":"Tkalcovna","category":"economic","roles":["urban","guild"],"tags":["weaving","master_craft"],"baskets":{"basic_clothing":4},
     "costs":[20,20,10,5],"turns":2,"req":"HAMLET","description":"Tká textil, jemné tkaniny a výšivky.",
     "levels":[{"name":"Tkalcovna","cost_mult":1,"recipes":["weave_basic"]},
               {"name":"Velká tkalcovna","cost_mult":2,"recipes":["weave_fine"]},
               {"name":"Tkalcovský cech","cost_mult":4,"recipes":["embroider_fine"]}]},
    {"name":"Kovárna","category":"economic","roles":["urban"],"tags":["smithing"],"baskets":{"tools":5,"metalwork":2},
     "costs":[15,20,10,15],"turns":2,"req":"HAMLET","description":"Kove nástroje z ingotů a řeziva.",
     "levels":[{"name":"Kovárna","cost_mult":1,"recipes":["forge_tools"]},
               {"name":"Zbrojnice","cost_mult":2,"recipes":[]},
               {"name":"Královská zbrojírna","cost_mult":4,"recipes":[]}]},
    {"name":"Zbrojířská dílna","category":"economic","roles":["urban","guild"],"tags":["smithing","armoring","master_craft"],"baskets":{"military_supply":4},
     "costs":[25,20,15,20],"turns":3,"req":"VILLAGE","description":"Vyrábí výzbroj, zbraně a mistrovské zbroje.",
     "levels":[{"name":"Zbrojířská dílna","cost_mult":1,"recipes":["forge_arms"]},
               {"name":"Velká zbrojírna","cost_mult":2,"recipes":["leather_armor"]},
               {"name":"Mistrovská zbrojírna","cost_mult":4,"recipes":["forge_fine_arms"]}]},
    {"name":"Stavební dílna","category":"economic","roles":["urban","guild"],"tags":["construction","master_craft"],"baskets":{"construction":5},
     "costs":[20,20,20,5],"turns":2,"req":"HAMLET","description":"Vyrábí stavební materiály, na nejvyšší úrovni reprezentativní.",
     "levels":[{"name":"Stavební dílna","cost_mult":1,"recipes":["build_materials"]},
               {"name":"Velká stavební dílna","cost_mult":2,"recipes":[]},
               {"name":"Mistrovská stavební dílna","cost_mult":4,"recipes":["build_luxury"]}]},
    {"name":"Hrnčířská dílna","category":"economic","roles":["urban"],"tags":["crafting"],"baskets":{"feast":3},
     "costs":[12,10,10,0],"turns":1,"req":"HAMLET","description":"Vyrábí keramiku a nádobí.",
     "levels":[{"name":"Hrnčířská dílna","cost_mult":1,"recipes":["make_pottery"]},
               {"name":"Velká hrnčírna","cost_mult":2,"recipes":[]},
               {"name":"Cechovní hrnčírna","cost_mult":4,"recipes":[]}]},
    {"name":"Vinařství","category":"economic","roles":["urban","guild"],"tags":["fermenting","master_craft"],"baskets":{"feast":4},
     "costs":[20,20,10,0],"turns":2,"req":"HAMLET","description":"Vyrábí víno, na nejvyšší úrovni archivní.",
     "levels":[{"name":"Vinařství","cost_mult":1,"recipes":["press_wine"]},
               {"name":"Velké vinařství","cost_mult":2,"recipes":[]},
               {"name":"Vinný sklep","cost_mult":4,"recipes":["age_wine"]}]},
    {"name":"Klenotnická dílna","category":"economic","roles":["guild"],"tags":["master_craft"],"baskets":{"luxury_clothing":3},
     "costs":[35,20,15,10],"turns":3,"req":"TOWN","description":"Cechovní klenotnictví — šperky z drahých kovů.",
     "levels":[{"name":"Klenotnická dílna","cost_mult":1,"recipes":["craft_jewelry"]},
               {"name":"Klenotnický cech","cost_mult":2,"recipes":[]},
               {"name":"Královská klenotnice","cost_mult":4,"recipes":[]}]},
    {"name":"Chrámová dílna","category":"economic","roles":["guild"],"tags":["ritual_craft"],"baskets":{"admin_supplies":3},
     "costs":[25,20,15,5],"turns":2,"req":"VILLAGE","description":"Vyrábí rituální předměty z pryskyřice a oleje.",
     "levels":[{"name":"Chrámová dílna","cost_mult":1,"recipes":["craft_ritual"]},
               {"name":"Velká chrámová dílna","cost_mult":2,"recipes":[]},
               {"name":"Svatá dílna","cost_mult":4,"recipes":[]}]}
  ]'::jsonb;
  b jsonb; lvl jsonb; i int; acc text[]; ld jsonb; base jsonb; meta jsonb; prev jsonb;
  existing_id uuid; existing_levels jsonb;
BEGIN
  FOR b IN SELECT * FROM jsonb_array_elements(spec) LOOP
    SELECT id, level_data INTO existing_id, existing_levels FROM public.building_templates WHERE name = b->>'name' LIMIT 1;
    acc := '{}'::text[]; ld := '[]'::jsonb; base := NULL; i := 0;
    FOR lvl IN SELECT * FROM jsonb_array_elements(b->'levels') LOOP
      i := i + 1;
      acc := acc || ARRAY(SELECT jsonb_array_elements_text(lvl->'recipes'));
      IF i = 1 THEN base := to_jsonb(acc); END IF;
      prev := COALESCE(existing_levels->(i-1)->'effects', '{}'::jsonb);
      ld := ld || jsonb_build_array(jsonb_build_object(
        'level', i,
        'name', COALESCE(existing_levels->(i-1)->>'name', lvl->>'name'),
        'cost_mult', COALESCE((existing_levels->(i-1)->>'cost_mult')::numeric, (lvl->>'cost_mult')::numeric),
        'unlock', existing_levels->(i-1)->>'unlock',
        'effects', prev || jsonb_build_object(
          'recipe_keys', to_jsonb(acc),
          'capability_tags', b->'tags',
          'production_roles', b->'roles',
          'basket_outputs', b->'baskets')));
    END LOOP;
    meta := jsonb_build_object('recipe_keys', base, 'capability_tags', b->'tags',
              'production_roles', b->'roles', 'basket_outputs', b->'baskets')
            || CASE WHEN COALESCE((b->>'requires_water')::boolean, false)
                 THEN '{"requires_water": true}'::jsonb ELSE '{}'::jsonb END;
    IF existing_id IS NULL THEN
      INSERT INTO public.building_templates
        (name, category, description, cost_wealth, cost_wood, cost_stone, cost_iron, build_turns,
         required_settlement_level, effects, max_level, level_data)
      VALUES (b->>'name', b->>'category', b->>'description',
              (b->'costs'->>0)::int, (b->'costs'->>1)::int, (b->'costs'->>2)::int, (b->'costs'->>3)::int,
              (b->>'turns')::int, b->>'req', meta, 3, ld);
    ELSE
      UPDATE public.building_templates
      SET effects = effects || meta, level_data = ld, max_level = 3,
          description = CASE WHEN COALESCE(description, '') = '' THEN b->>'description' ELSE description END
      WHERE id = existing_id;
    END IF;
  END LOOP;
END $$;