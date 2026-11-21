-- Food resources v1 (docs/design/food-resources-v1.md): 40 map resources.
-- Additive catalogue sync mirrored from supabase/functions/_shared/foodResources.ts.
-- New recipes are attached to EXISTING building templates only as effects.specialization_recipe_keys;
-- recipe_keys (what the economy runs today) are untouched, so no live session changes output.
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, storable, friction_profile) VALUES
('food_wheat','Pšenice','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_barley','Ječmen','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_rye','Žito','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_oats','Oves','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_millet','Proso','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_sorghum','Čirok','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_rice','Rýže','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_maize','Kukuřice','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_teff','Tef','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_lentils','Čočka','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_chickpeas','Cizrna','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_peas','Hrách','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_fava_beans','Bob obecný','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_common_beans','Fazole','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_cowpeas','Vigna (cowpea)','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_soybeans','Sója','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_peanuts','Podzemnice','food','raw','mass',0,0.6,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_potatoes','Brambory','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_sweet_potatoes','Batáty','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_cassava','Maniok','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_yams','Jamy','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_taro','Taro','food','raw','mass',0,0.5,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_squash','Tykve','food','raw','mass',0,0.6,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_onions','Cibule','food','raw','mass',0,0.6,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_cabbage','Zelí','food','raw','mass',0,0.6,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_bananas_plantains','Banány a plantainy','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_dates','Datle','food','raw','mass',0,0.8,'staple_food',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('food_olives','Olivy','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_grapes','Vinná réva','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_garlic','Česnek','food','raw','mass',0,0.6,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_cattle','Skot','food','raw','mass',0,1,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_sheep','Ovce','food','raw','mass',0,1,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_goats','Kozy','food','raw','mass',0,1,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_pigs','Prasata','food','raw','mass',0,1,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_chickens','Slepice','food','raw','mass',0,0.9,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_ducks_geese','Kachny a husy','food','raw','mass',0,0.9,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_freshwater_fish','Sladkovodní ryby','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_marine_fish','Mořské ryby','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_shellfish','Měkkýši a korýši','food','raw','mass',0,0.8,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('food_bees','Včelstva','food','raw','refined',1,2,'variety',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('milled_rice','Loupaná rýže','food','final','mass',0,1.2,'staple_food',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('pulse_groats','Luštěninové kroupy','food','processed','mass',0,1,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('pulse_stew','Luštěninová kaše','food','final','mass',0,1.6,'staple_food',false,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('cassava_meal','Odjedovaná maniková mouka','food','processed','mass',0,0.9,'staple_food',true,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('cooked_tubers','Vařené hlízy','food','final','mass',0,1.3,'staple_food',false,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('dried_fruit','Sušené ovoce','food','final','mass',0,2,'staple_food',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('raw_milk','Mléko','food','raw','mass',0,0.9,'staple_food',false,'{"final_use":false,"household":false,"food_resources_version":1}'::jsonb),
('dairy_food','Sýr a tvaroh','food','final','mass',0,2,'staple_food',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('eggs','Vejce','food','final','mass',0,1.2,'staple_food',false,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('seed_oil','Rostlinný olej','food','processed','refined',1,2.2,'variety',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb),
('mead','Medovina','drink','final','refined',1,3,'feast',true,'{"final_use":true,"household":false,"food_resources_version":1}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.production_recipes (recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, labor_cost, description)
SELECT v.* FROM (VALUES
('harvest_food_wheat','food_wheat',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Pšenice'),
('harvest_food_barley','food_barley',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Ječmen'),
('harvest_food_rye','food_rye',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Žito'),
('harvest_food_oats','food_oats',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Oves'),
('harvest_food_millet','food_millet',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Proso'),
('harvest_food_sorghum','food_sorghum',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Čirok'),
('harvest_food_rice','food_rice',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Rýže'),
('harvest_food_maize','food_maize',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Kukuřice'),
('harvest_food_teff','food_teff',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Tef'),
('harvest_food_lentils','food_lentils',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Čočka'),
('harvest_food_chickpeas','food_chickpeas',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Cizrna'),
('harvest_food_peas','food_peas',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Hrách'),
('harvest_food_fava_beans','food_fava_beans',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Bob obecný'),
('harvest_food_common_beans','food_common_beans',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Fazole'),
('harvest_food_cowpeas','food_cowpeas',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Vigna (cowpea)'),
('harvest_food_soybeans','food_soybeans',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Sója'),
('harvest_food_peanuts','food_peanuts',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Podzemnice'),
('harvest_food_potatoes','food_potatoes',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Brambory'),
('harvest_food_sweet_potatoes','food_sweet_potatoes',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Batáty'),
('harvest_food_cassava','food_cassava',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Maniok'),
('harvest_food_yams','food_yams',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Jamy'),
('harvest_food_taro','food_taro',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Taro'),
('harvest_food_squash','food_squash',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Tykve'),
('harvest_food_onions','food_onions',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Cibule'),
('harvest_food_cabbage','food_cabbage',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Zelí'),
('harvest_food_bananas_plantains','food_bananas_plantains',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Banány a plantainy'),
('harvest_food_dates','food_dates',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Datle'),
('harvest_food_olives','food_olives',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Olivy'),
('harvest_food_grapes','food_grapes',3,'[]'::jsonb,'source',ARRAY['farming','viticulture']::text[],1,'Sklizeň: Vinná réva'),
('harvest_food_garlic','food_garlic',3,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Česnek'),
('harvest_food_cattle','food_cattle',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Skot'),
('harvest_food_sheep','food_sheep',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Ovce'),
('harvest_food_goats','food_goats',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Kozy'),
('harvest_food_pigs','food_pigs',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Prasata'),
('harvest_food_chickens','food_chickens',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Slepice'),
('harvest_food_ducks_geese','food_ducks_geese',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sklizeň: Kachny a husy'),
('harvest_food_freshwater_fish','food_freshwater_fish',3,'[]'::jsonb,'source',ARRAY['fishing']::text[],1,'Sklizeň: Sladkovodní ryby'),
('harvest_food_marine_fish','food_marine_fish',3,'[]'::jsonb,'source',ARRAY['fishing']::text[],1,'Sklizeň: Mořské ryby'),
('harvest_food_shellfish','food_shellfish',2,'[]'::jsonb,'source',ARRAY['fishing']::text[],1,'Sklizeň: Měkkýši a korýši'),
('harvest_food_bees','food_bees',1,'[]'::jsonb,'source',ARRAY['farming']::text[],1,'Sklizeň: Včelstva'),
('mill_wheat','flour',2,'[{"key":"food_wheat","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Pšenice'),
('mill_barley','flour',2,'[{"key":"food_barley","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Ječmen'),
('mill_rye','flour',2,'[{"key":"food_rye","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Žito'),
('mill_oats','flour',2,'[{"key":"food_oats","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Oves'),
('mill_millet','flour',2,'[{"key":"food_millet","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Proso'),
('mill_sorghum','flour',2,'[{"key":"food_sorghum","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Čirok'),
('hull_rice','milled_rice',2,'[{"key":"food_rice","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Loupání rýže'),
('mill_maize','flour',2,'[{"key":"food_maize","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Kukuřice'),
('mill_teff','flour',2,'[{"key":"food_teff","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Mletí: Tef'),
('split_lentils','pulse_groats',2,'[{"key":"food_lentils","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Čočka'),
('split_chickpeas','pulse_groats',2,'[{"key":"food_chickpeas","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Cizrna'),
('split_peas','pulse_groats',2,'[{"key":"food_peas","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Hrách'),
('split_fava_beans','pulse_groats',2,'[{"key":"food_fava_beans","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Bob obecný'),
('split_common_beans','pulse_groats',2,'[{"key":"food_common_beans","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Fazole'),
('split_cowpeas','pulse_groats',2,'[{"key":"food_cowpeas","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Vigna (cowpea)'),
('split_soybeans','pulse_groats',2,'[{"key":"food_soybeans","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Sója'),
('press_soybeans','seed_oil',1,'[{"key":"food_soybeans","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['pressing']::text[],1,'Lisování oleje: Sója'),
('split_peanuts','pulse_groats',2,'[{"key":"food_peanuts","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Šrotování: Podzemnice'),
('press_peanuts','seed_oil',1,'[{"key":"food_peanuts","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['pressing']::text[],1,'Lisování oleje: Podzemnice'),
('cook_potatoes','cooked_tubers',2,'[{"key":"food_potatoes","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření: Brambory'),
('cook_sweet_potatoes','cooked_tubers',2,'[{"key":"food_sweet_potatoes","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření: Batáty'),
('detox_cassava','cassava_meal',2,'[{"key":"food_cassava","qty":3,"kind":"material"}]'::jsonb,'processing',ARRAY['milling']::text[],1,'Odjedování manioku'),
('cook_yams','cooked_tubers',2,'[{"key":"food_yams","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření: Jamy'),
('cook_taro','cooked_tubers',2,'[{"key":"food_taro","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření: Taro'),
('cook_squash','cooked_tubers',2,'[{"key":"food_squash","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření: Tykve'),
('preserve_onions','preserved_food',1,'[{"key":"food_onions","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Konzervace: Cibule'),
('preserve_cabbage','preserved_food',1,'[{"key":"food_cabbage","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Konzervace: Zelí'),
('dry_bananas_plantains','dried_fruit',1,'[{"key":"food_bananas_plantains","qty":3,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Sušení: Banány a plantainy'),
('dry_dates','dried_fruit',1,'[{"key":"food_dates","qty":2,"kind":"material"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Sušení: Datle'),
('press_food_olives','olive_oil',1,'[{"key":"food_olives","qty":2,"kind":"material"}]'::jsonb,'processing',ARRAY['pressing']::text[],1,'Lisování oliv'),
('press_food_grapes','wine_standard',2,'[{"key":"food_grapes","qty":3,"kind":"material"}]'::jsonb,'urban',ARRAY['fermenting']::text[],1,'Výroba vína'),
('preserve_garlic','preserved_food',1,'[{"key":"food_garlic","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Konzervace: Česnek'),
('cure_cattle','preserved_food',2,'[{"key":"food_cattle","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Skot'),
('cure_sheep','preserved_food',2,'[{"key":"food_sheep","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Ovce'),
('cure_goats','preserved_food',2,'[{"key":"food_goats","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Kozy'),
('cure_pigs','preserved_food',2,'[{"key":"food_pigs","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Prasata'),
('cure_chickens','preserved_food',2,'[{"key":"food_chickens","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Slepice'),
('cure_ducks_geese','preserved_food',2,'[{"key":"food_ducks_geese","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Kachny a husy'),
('cure_freshwater_fish','preserved_food',2,'[{"key":"food_freshwater_fish","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Sladkovodní ryby'),
('cure_marine_fish','preserved_food',2,'[{"key":"food_marine_fish","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Mořské ryby'),
('cure_shellfish','preserved_food',2,'[{"key":"food_shellfish","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'processing',ARRAY['preserving']::text[],1,'Uzení / sušení: Měkkýši a korýši'),
('ferment_mead','mead',1,'[{"key":"food_bees","qty":2,"kind":"material"}]'::jsonb,'urban',ARRAY['fermenting']::text[],1,'Výroba medoviny'),
('milk_cattle','raw_milk',3,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Dojení skotu'),
('milk_goats','raw_milk',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Dojení koz'),
('collect_eggs','eggs',2,'[]'::jsonb,'source',ARRAY['herding']::text[],1,'Sběr vajec'),
('make_cheese','dairy_food',1,'[{"key":"raw_milk","qty":3,"kind":"material"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Sýrařství'),
('cook_pulses','pulse_stew',2,'[{"key":"pulse_groats","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Vaření luštěnin'),
('bake_cassava','cooked_tubers',2,'[{"key":"cassava_meal","qty":2,"kind":"material"},{"key":"charcoal","qty":1,"kind":"operating"}]'::jsonb,'urban',ARRAY['baking']::text[],1,'Pečení manioku')
) AS v(recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, labor_cost, description)
WHERE NOT EXISTS (SELECT 1 FROM public.production_recipes p WHERE p.recipe_key = v.recipe_key);

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["harvest_food_wheat","harvest_food_barley","harvest_food_rye","harvest_food_oats","harvest_food_millet","harvest_food_sorghum","harvest_food_maize","harvest_food_teff","harvest_food_lentils","harvest_food_chickpeas","harvest_food_peas","harvest_food_fava_beans","harvest_food_common_beans","harvest_food_cowpeas","harvest_food_soybeans","harvest_food_peanuts","harvest_food_potatoes","harvest_food_sweet_potatoes","harvest_food_cassava","harvest_food_yams","harvest_food_taro","harvest_food_squash","harvest_food_onions","harvest_food_cabbage","harvest_food_bananas_plantains","harvest_food_dates","harvest_food_olives","harvest_food_garlic","harvest_food_cattle","harvest_food_sheep","harvest_food_goats","harvest_food_pigs","harvest_food_chickens","harvest_food_ducks_geese","harvest_food_bees","milk_cattle","milk_goats","collect_eggs"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["harvest_food_wheat","harvest_food_barley","harvest_food_rye","harvest_food_oats","harvest_food_millet","harvest_food_sorghum","harvest_food_maize","harvest_food_teff","harvest_food_lentils","harvest_food_chickpeas","harvest_food_peas","harvest_food_fava_beans","harvest_food_common_beans","harvest_food_cowpeas","harvest_food_soybeans","harvest_food_peanuts","harvest_food_potatoes","harvest_food_sweet_potatoes","harvest_food_cassava","harvest_food_yams","harvest_food_taro","harvest_food_squash","harvest_food_onions","harvest_food_cabbage","harvest_food_bananas_plantains","harvest_food_dates","harvest_food_olives","harvest_food_garlic","harvest_food_cattle","harvest_food_sheep","harvest_food_goats","harvest_food_pigs","harvest_food_chickens","harvest_food_ducks_geese","harvest_food_bees","milk_cattle","milk_goats","collect_eggs"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Farma' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["harvest_food_rice"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["harvest_food_rice"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Rýžoviště' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["harvest_food_grapes"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["harvest_food_grapes"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Vinice' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["harvest_food_freshwater_fish","harvest_food_marine_fish","harvest_food_shellfish"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["harvest_food_freshwater_fish","harvest_food_marine_fish","harvest_food_shellfish"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Rybářství' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["mill_wheat","mill_barley","mill_rye","mill_oats","mill_millet","mill_sorghum","hull_rice","mill_maize","mill_teff","split_lentils","split_chickpeas","split_peas","split_fava_beans","split_common_beans","split_cowpeas","split_soybeans","split_peanuts","detox_cassava"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["mill_wheat","mill_barley","mill_rye","mill_oats","mill_millet","mill_sorghum","hull_rice","mill_maize","mill_teff","split_lentils","split_chickpeas","split_peas","split_fava_beans","split_common_beans","split_cowpeas","split_soybeans","split_peanuts","detox_cassava"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Mlýn' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["press_soybeans","press_peanuts","press_food_olives"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["press_soybeans","press_peanuts","press_food_olives"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Lisovna oleje' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["cook_potatoes","cook_sweet_potatoes","cook_yams","cook_taro","cook_squash","make_cheese","cook_pulses","bake_cassava"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["cook_potatoes","cook_sweet_potatoes","cook_yams","cook_taro","cook_squash","make_cheese","cook_pulses","bake_cassava"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Pekárna' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["preserve_onions","preserve_cabbage","dry_bananas_plantains","dry_dates","preserve_garlic","cure_cattle","cure_sheep","cure_goats","cure_pigs","cure_chickens","cure_ducks_geese","cure_freshwater_fish","cure_marine_fish","cure_shellfish"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["preserve_onions","preserve_cabbage","dry_bananas_plantains","dry_dates","preserve_garlic","cure_cattle","cure_sheep","cure_goats","cure_pigs","cure_chickens","cure_ducks_geese","cure_freshwater_fish","cure_marine_fish","cure_shellfish"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Udírna a solírna' AND jsonb_typeof(level_data) = 'array';

UPDATE public.building_templates SET
  effects = jsonb_set(coalesce(effects,'{}'::jsonb), '{specialization_recipe_keys}', '["press_food_grapes","ferment_mead"]'::jsonb),
  level_data = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{effects,specialization_recipe_keys}', '["press_food_grapes","ferment_mead"]'::jsonb) ORDER BY o), level_data)
                FROM jsonb_array_elements(level_data) WITH ORDINALITY AS t(l, o))
WHERE name = 'Vinařství' AND jsonb_typeof(level_data) = 'array';