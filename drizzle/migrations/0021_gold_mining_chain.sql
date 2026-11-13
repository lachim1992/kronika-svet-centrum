INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, substitution_map, storable, description, friction_profile)
SELECT 'gold_ore','Zlatá ruda','metalwork','raw','luxury',1,3.0,'luxury_clothing','{}'::jsonb,true,'Ruda se zlatem z potvrzené žíly — surovina, ne mince','{"final_use": false, "household": false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.goods WHERE key='gold_ore');
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, substitution_map, storable, description, friction_profile)
SELECT 'gold_ingot','Zlatý slitek','metalwork','processed','luxury',2,12.0,'luxury_clothing','{"prestige": 0.5}'::jsonb,true,'Rafinované zlato — obchodní a pokladní zboží, nikoli peníze v pokladně','{"final_use": false, "household": false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.goods WHERE key='gold_ingot');

UPDATE public.production_recipes SET output_good_key='gold_ore', output_quantity=1, required_tags=ARRAY['gold_mining'], quality_output_bonus=0, description='Těžba zlaté rudy z potvrzené žíly'
 WHERE recipe_key='mine_gold';
INSERT INTO public.production_recipes (recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, min_quality_input, quality_output_bonus, labor_cost, description)
SELECT 'refine_gold','gold_ingot',1,'[{"key":"gold_ore","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['gold_refining'],0,0,3,'Rafinace zlaté rudy na slitky (palivo: dřevěné uhlí)'
WHERE NOT EXISTS (SELECT 1 FROM public.production_recipes WHERE recipe_key='refine_gold');
UPDATE public.production_recipes SET input_items='[{"key":"gold_ingot","qty":1}]'::jsonb WHERE recipe_key='craft_jewelry';

-- Generic mine no longer yields gold at level 3; gold comes only from a dedicated mine on a confirmed vein.
UPDATE public.building_templates SET level_data = (
  SELECT jsonb_agg(CASE WHEN (l->>'level')='3' THEN jsonb_set(jsonb_set(l,'{effects,recipe_keys}','["mine_iron","mine_copper"]'::jsonb),'{unlock}','"Hlubší štoly"'::jsonb) - 'wealth' ELSE l END ORDER BY (l->>'level')::int)
  FROM jsonb_array_elements(level_data) l) WHERE name='Důl';

INSERT INTO public.building_templates (name, category, description, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, effects, is_unique, max_level, level_data)
SELECT 'Zlatý důl','economic','Štola na potvrzené zlaté žíle. Staví se jen na využívané půdě a těží konečnou zásobu ložiska.',20,15,5,40,3,'HAMLET',
 '{"recipe_keys":["mine_gold"],"capability_tags":["gold_mining"],"production_roles":["source"]}'::jsonb,false,3,
 '[{"name":"Zlatý důl","level":1,"unlock":null,"cost_mult":1,"effects":{"recipe_keys":["mine_gold"],"capability_tags":["gold_mining"],"production_roles":["source"]}},
   {"name":"Hlubinný zlatý důl","level":2,"unlock":"Vyšší výtěžnost","cost_mult":2,"effects":{"recipe_keys":["mine_gold"],"capability_tags":["gold_mining"],"production_roles":["source"]}},
   {"name":"Královský zlatý důl","level":3,"unlock":"Vyšší výtěžnost","cost_mult":4,"effects":{"recipe_keys":["mine_gold"],"capability_tags":["gold_mining"],"production_roles":["source"]}}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.building_templates WHERE name='Zlatý důl');
INSERT INTO public.building_templates (name, category, description, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, effects, is_unique, max_level, level_data)
SELECT 'Zlatá huť','economic','Rafinuje zlatou rudu na slitky. Potřebuje dřevěné uhlí; slitky jsou zboží, ne peníze.',15,20,10,35,2,'TOWNSHIP',
 '{"recipe_keys":["refine_gold"],"capability_tags":["gold_refining"],"production_roles":["processing"]}'::jsonb,false,1,
 '[{"name":"Zlatá huť","level":1,"unlock":null,"cost_mult":1,"effects":{"recipe_keys":["refine_gold"],"capability_tags":["gold_refining"],"production_roles":["processing"]}}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.building_templates WHERE name='Zlatá huť');