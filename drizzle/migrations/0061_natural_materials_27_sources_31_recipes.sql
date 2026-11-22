-- Nonfood physical goods, geological source recipes, and existing processing buildings.
-- ONE ledger; source goods never credit treasury. All numeric ratios are provisional game parameters.
BEGIN;
INSERT INTO goods(key,display_name,category,production_stage,market_tier,base_price_band,base_price_numeric,demand_basket,substitution_map,storable,description,friction_profile)
VALUES
('iron_ore','Železná ruda','metalwork','raw','mass',0,2.2,'metalwork','{}'::jsonb,true,'Železná ruda — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('copper_ore','Měděná ruda','metalwork','raw','mass',0,2.5,'metalwork','{}'::jsonb,true,'Měděná ruda — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('tin_ore','Cínová ruda','metalwork','raw','mass',0,3.1,'metalwork','{}'::jsonb,true,'Cínová ruda — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('lead_ore','Olověná ruda','metalwork','raw','mass',0,2.4,'metalwork','{}'::jsonb,true,'Olověná ruda — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('silver_ore','Stříbrná ruda','craft','raw','mass',0,5.2,'luxury_clothing','{}'::jsonb,true,'Stříbrná ruda — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_coal','Uhlí','raw','raw','mass',0,1.4,'fuel','{}'::jsonb,true,'Uhlí — přírodní výrobní řetězec','{"final_use":true,"household":true,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_salt','Kamenná sůl','craft','raw','mass',0,2.8,'variety','{}'::jsonb,true,'Kamenná sůl — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_sulfur','Síra','metalwork','raw','mass',0,3.4,'metalwork','{}'::jsonb,true,'Síra — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_granite','Žula','construction','raw','mass',0,2.2,'construction','{}'::jsonb,true,'Žula — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_marble','Mramor','construction','raw','mass',0,4.1,'construction','{}'::jsonb,true,'Mramor — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_limestone','Vápenec','construction','raw','mass',0,1.5,'construction','{}'::jsonb,true,'Vápenec — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_sandstone','Pískovec','construction','raw','mass',0,1.5,'construction','{}'::jsonb,true,'Pískovec — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_flint','Pazourek','craft','raw','mass',0,2.5,'tools','{}'::jsonb,true,'Pazourek — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_obsidian','Obsidián','craft','raw','mass',0,5.5,'tools','{}'::jsonb,true,'Obsidián — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_gypsum','Sádrovec','construction','raw','mass',0,2,'construction','{}'::jsonb,true,'Sádrovec — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_clay','Hrnčířský jíl','construction','raw','mass',0,0.9,'construction','{}'::jsonb,true,'Hrnčířský jíl — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_kaolin','Kaolín','construction','raw','mass',0,2.1,'construction','{}'::jsonb,true,'Kaolín — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_sand','Křemičitý písek','construction','raw','mass',0,0.8,'construction','{}'::jsonb,true,'Křemičitý písek — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_ochre','Okr a minerální pigment','craft','raw','mass',0,2.4,'admin_supplies','{}'::jsonb,true,'Okr a minerální pigment — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_cedar','Cedrové kmeny','construction','raw','mass',0,2.6,'construction','{}'::jsonb,true,'Cedrové kmeny — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_hardwood','Tvrdé dřevo','construction','raw','mass',0,1.8,'construction','{}'::jsonb,true,'Tvrdé dřevo — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('raw_resin','Pryskyřice','craft','raw','mass',0,2.6,'admin_supplies','{}'::jsonb,true,'Pryskyřice — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_hemp','Konopné vlákno','textile','raw','mass',0,1.6,'basic_clothing','{}'::jsonb,true,'Konopné vlákno — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_cotton','Surová bavlna','textile','raw','mass',0,2.4,'basic_clothing','{}'::jsonb,true,'Surová bavlna — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_reeds','Rákos','craft','raw','mass',0,1.1,'storage_logistics','{}'::jsonb,true,'Rákos — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_papyrus','Papyrus','craft','raw','mass',0,2.7,'admin_supplies','{}'::jsonb,true,'Papyrus — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_herbs','Léčivé byliny','craft','raw','mass',0,2.6,'variety','{}'::jsonb,true,'Léčivé byliny — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('tin_ingot','Cínový ingot','metalwork','processed','mass',0,3.7,'tools','{}'::jsonb,true,'Cínový ingot — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('lead_ingot','Olověný ingot','metalwork','processed','mass',0,3.1,'tools','{}'::jsonb,true,'Olověný ingot — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('silver_ingot','Stříbrný ingot','metalwork','processed','mass',0,6.4,'luxury_clothing','{}'::jsonb,true,'Stříbrný ingot — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('bronze_ingot','Bronzový ingot','metalwork','processed','mass',0,4.5,'tools','{}'::jsonb,true,'Bronzový ingot — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('fine_lumber','Kvalitní cedrové řezivo','construction','processed','mass',0,3.7,'construction','{}'::jsonb,true,'Kvalitní cedrové řezivo — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('hardwood_lumber','Tvrdé řezivo','construction','processed','mass',0,2.5,'construction','{}'::jsonb,true,'Tvrdé řezivo — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('bricks','Pálené cihly','construction','processed','mass',0,2.5,'construction','{}'::jsonb,true,'Pálené cihly — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('glassware','Skleněné zboží','craft','final','mass',0,4.6,'variety','{}'::jsonb,true,'Skleněné zboží — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('quicklime','Pálené vápno','construction','processed','mass',0,2,'construction','{}'::jsonb,true,'Pálené vápno — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('plaster','Sádrová omítka','construction','processed','mass',0,2.6,'construction','{}'::jsonb,true,'Sádrová omítka — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('marble_blocks','Mramorové bloky','construction','processed','mass',0,5,'construction','{}'::jsonb,true,'Mramorové bloky — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('granite_blocks','Žulové bloky','construction','processed','mass',0,3,'construction','{}'::jsonb,true,'Žulové bloky — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('sandstone_blocks','Pískovcové bloky','construction','processed','mass',0,2.7,'construction','{}'::jsonb,true,'Pískovcové bloky — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":8}'::jsonb),
('stone_tools','Pazourkové nástroje','metalwork','final','mass',0,2,'tools','{}'::jsonb,true,'Pazourkové nástroje — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('obsidian_tools','Obsidiánové nástroje','metalwork','final','mass',0,4,'tools','{}'::jsonb,true,'Obsidiánové nástroje — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('pigments','Pigmenty','craft','processed','mass',0,3.2,'admin_supplies','{}'::jsonb,true,'Pigmenty — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('cotton_yarn','Bavlněná příze','textile','processed','mass',0,2.5,'basic_clothing','{}'::jsonb,true,'Bavlněná příze — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('wool_yarn','Vlněná příze','textile','processed','mass',0,2,'basic_clothing','{}'::jsonb,true,'Vlněná příze — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('rope','Provazy a lana','textile','final','mass',0,2.5,'storage_logistics','{}'::jsonb,true,'Provazy a lana — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('basketry','Košíkářské výrobky','craft','final','mass',0,2,'storage_logistics','{}'::jsonb,true,'Košíkářské výrobky — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('remedy_goods','Léčivé přípravky','craft','final','mass',0,3.8,'variety','{}'::jsonb,true,'Léčivé přípravky — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('refined_salt','Kuchyňská sůl','craft','processed','mass',0,3.5,'variety','{}'::jsonb,true,'Kuchyňská sůl — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('sulfur_pigment','Sirné barvivo','craft','processed','mass',0,3.4,'admin_supplies','{}'::jsonb,true,'Sirné barvivo — přírodní výrobní řetězec','{"final_use":true,"household":false,"perishability":0,"bulk_factor":1}'::jsonb),
('raw_wool','Ovčí vlna','textile','raw','mass',0,1.2,'basic_clothing','{}'::jsonb,true,'Ovčí vlna — přírodní výrobní řetězec','{"final_use":false,"household":false,"perishability":0,"bulk_factor":1}'::jsonb)
ON CONFLICT(key) DO UPDATE SET display_name=excluded.display_name,category=excluded.category,production_stage=excluded.production_stage,base_price_numeric=excluded.base_price_numeric,demand_basket=excluded.demand_basket,friction_profile=excluded.friction_profile;
INSERT INTO resource_types(key,display_name,category,replicable,base_quality_band,strategic_weight,spawn_biomes,storable,description)
VALUES
('iron_ore','Železná ruda','ore',false,1,'strategic',ARRAY['hillock','saddle','cliff_edge','steep_slope','ridge_woods']::text[],true,'Mikrobiomy: hillock 35%, saddle 30%, cliff_edge 40%, steep_slope 35%, ridge_woods 15%'),
('copper_ore','Měděná ruda','ore',false,1,'strategic',ARRAY['hillock','saddle','cliff_edge','steep_slope']::text[],true,'Mikrobiomy: hillock 20%, saddle 20%, cliff_edge 25%, steep_slope 20%'),
('tin_ore','Cínová ruda','ore',false,1,'strategic',ARRAY['hillock','saddle','cliff_edge','steep_slope']::text[],true,'Mikrobiomy: hillock 14%, saddle 10%, cliff_edge 20%, steep_slope 15%'),
('lead_ore','Olověná ruda','ore',false,1,'strategic',ARRAY['hillock','saddle','cliff_edge','steep_slope']::text[],true,'Mikrobiomy: hillock 19%, saddle 11%, cliff_edge 22%, steep_slope 13%'),
('silver_ore','Stříbrná ruda','ore',false,1,'strategic',ARRAY['hillock','cliff_edge','steep_slope']::text[],true,'Mikrobiomy: hillock 8%, cliff_edge 13%, steep_slope 10%'),
('raw_coal','Uhlí','ore',false,1,'strategic',ARRAY['hillock','cliff_edge','steep_slope','ridge_woods']::text[],true,'Mikrobiomy: hillock 19%, cliff_edge 22%, steep_slope 18%, ridge_woods 12%'),
('raw_salt','Kamenná sůl','ore',false,1,'strategic',ARRAY['sand_flat','dune','cliff_edge','shore']::text[],true,'Mikrobiomy: sand_flat 16%, dune 15%, cliff_edge 12%, shore 9%'),
('raw_sulfur','Síra','ore',false,1,'strategic',ARRAY['steep_slope','cliff_edge','hillock']::text[],true,'Mikrobiomy: steep_slope 12%, cliff_edge 12%, hillock 6%'),
('raw_granite','Žula','ore',false,1,'strategic',ARRAY['cliff_edge','hillock','steep_slope','saddle']::text[],true,'Mikrobiomy: cliff_edge 45%, hillock 30%, steep_slope 35%, saddle 25%'),
('raw_marble','Mramor','ore',false,1,'strategic',ARRAY['cliff_edge','terrace','hillock']::text[],true,'Mikrobiomy: cliff_edge 13%, terrace 10%, hillock 11%'),
('raw_limestone','Vápenec','ore',false,1,'strategic',ARRAY['hillock','cliff_edge','terrace','steep_slope']::text[],true,'Mikrobiomy: hillock 35%, cliff_edge 35%, terrace 20%, steep_slope 20%'),
('raw_sandstone','Pískovec','ore',false,1,'strategic',ARRAY['hillock','steep_slope','sand_flat','terrace']::text[],true,'Mikrobiomy: hillock 25%, steep_slope 18%, sand_flat 22%, terrace 10%'),
('raw_flint','Pazourek','ore',false,1,'strategic',ARRAY['hillock','terrace','steep_slope']::text[],true,'Mikrobiomy: hillock 25%, terrace 16%, steep_slope 16%'),
('raw_obsidian','Obsidián','ore',false,1,'strategic',ARRAY['steep_slope','cliff_edge']::text[],true,'Mikrobiomy: steep_slope 9%, cliff_edge 11%'),
('raw_gypsum','Sádrovec','ore',false,1,'strategic',ARRAY['sand_flat','dune','steep_slope']::text[],true,'Mikrobiomy: sand_flat 15%, dune 12%, steep_slope 15%'),
('raw_clay','Hrnčířský jíl','stone',true,1,'ordinary',ARRAY['fertile_silt','creek_bank','boggy_dip','raised_bank']::text[],true,'Mikrobiomy: fertile_silt 40%, creek_bank 45%, boggy_dip 30%, raised_bank 22%'),
('raw_kaolin','Kaolín','ore',false,1,'strategic',ARRAY['fertile_silt','creek_bank','hillock']::text[],true,'Mikrobiomy: fertile_silt 12%, creek_bank 8%, hillock 12%'),
('raw_sand','Křemičitý písek','stone',true,1,'ordinary',ARRAY['sand_flat','dune','shore']::text[],true,'Mikrobiomy: sand_flat 100%, dune 85%, shore 72%'),
('raw_ochre','Okr a minerální pigment','ore',false,1,'strategic',ARRAY['hillock','steep_slope','terrace']::text[],true,'Mikrobiomy: hillock 19%, steep_slope 13%, terrace 8%'),
('raw_cedar','Cedrové kmeny','wood',true,1,'ordinary',ARRAY['dense_forest','ridge_woods']::text[],true,'Mikrobiomy: dense_forest 21%, ridge_woods 14%'),
('raw_hardwood','Tvrdé dřevo','wood',true,1,'ordinary',ARRAY['dense_forest','ridge_woods']::text[],true,'Mikrobiomy: dense_forest 45%, ridge_woods 32%'),
('raw_resin','Pryskyřice','wood',true,1,'ordinary',ARRAY['dense_forest','ridge_woods','clearing']::text[],true,'Mikrobiomy: dense_forest 30%, ridge_woods 35%, clearing 10%'),
('raw_hemp','Konopné vlákno','fiber',true,1,'ordinary',ARRAY['fertile_flat','fertile_silt','grassland','creek_bank']::text[],true,'Mikrobiomy: fertile_flat 20%, fertile_silt 18%, grassland 8%, creek_bank 20%'),
('raw_cotton','Surová bavlna','fiber',true,1,'ordinary',ARRAY['fertile_flat','fertile_silt','clearing']::text[],true,'Mikrobiomy: fertile_flat 15%, fertile_silt 24%, clearing 12%'),
('raw_reeds','Rákos','fiber',true,1,'ordinary',ARRAY['reed_marsh','boggy_dip','creek_bank']::text[],true,'Mikrobiomy: reed_marsh 60%, boggy_dip 44%, creek_bank 26%'),
('raw_papyrus','Papyrus','fiber',true,1,'ordinary',ARRAY['reed_marsh','creek_bank','boggy_dip']::text[],true,'Mikrobiomy: reed_marsh 23%, creek_bank 17%, boggy_dip 13%'),
('raw_herbs','Léčivé byliny','raw',true,1,'ordinary',ARRAY['clearing','dense_forest','grassland','sheltered_hollow','boggy_dip']::text[],true,'Mikrobiomy: clearing 20%, dense_forest 25%, grassland 12%, sheltered_hollow 19%, boggy_dip 20%')
ON CONFLICT(key) DO UPDATE SET display_name=excluded.display_name,category=excluded.category,replicable=excluded.replicable,spawn_biomes=excluded.spawn_biomes,description=excluded.description;
INSERT INTO production_recipes(recipe_key,output_good_key,output_quantity,input_items,required_role,required_tags,min_quality_input,quality_output_bonus,labor_cost,description)
VALUES
('mine_iron','iron_ore',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Železná ruda'),
('mine_copper','copper_ore',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Měděná ruda'),
('mine_tin','tin_ore',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Cínová ruda'),
('mine_lead','lead_ore',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Olověná ruda'),
('mine_silver','silver_ore',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Stříbrná ruda'),
('mine_coal','raw_coal',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Uhlí'),
('mine_salt','raw_salt',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Kamenná sůl'),
('mine_sulfur','raw_sulfur',2,'[]'::jsonb,'source',ARRAY['mining']::text[],0,0,1,'Síra'),
('quarry_granite','raw_granite',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Žula'),
('quarry_marble','raw_marble',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Mramor'),
('quarry_limestone','raw_limestone',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Vápenec'),
('quarry_sandstone','raw_sandstone',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Pískovec'),
('quarry_flint','raw_flint',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Pazourek'),
('quarry_obsidian','raw_obsidian',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Obsidián'),
('quarry_gypsum','raw_gypsum',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Sádrovec'),
('dig_clay','raw_clay',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Hrnčířský jíl'),
('dig_kaolin','raw_kaolin',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Kaolín'),
('collect_sand','raw_sand',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Křemičitý písek'),
('quarry_ochre','raw_ochre',2,'[]'::jsonb,'source',ARRAY['quarrying']::text[],0,0,1,'Okr a minerální pigment'),
('fell_cedar','raw_cedar',2,'[]'::jsonb,'source',ARRAY['logging']::text[],0,0,1,'Cedrové kmeny'),
('fell_hardwood','raw_hardwood',2,'[]'::jsonb,'source',ARRAY['logging']::text[],0,0,1,'Tvrdé dřevo'),
('tap_resin','raw_resin',2,'[]'::jsonb,'source',ARRAY['logging']::text[],0,0,1,'Pryskyřice'),
('harvest_hemp','raw_hemp',2,'[]'::jsonb,'source',ARRAY['farming']::text[],0,0,1,'Konopné vlákno'),
('harvest_cotton','raw_cotton',2,'[]'::jsonb,'source',ARRAY['farming']::text[],0,0,1,'Surová bavlna'),
('harvest_reeds','raw_reeds',2,'[]'::jsonb,'source',ARRAY['farming']::text[],0,0,1,'Rákos'),
('harvest_papyrus','raw_papyrus',2,'[]'::jsonb,'source',ARRAY['farming']::text[],0,0,1,'Papyrus'),
('collect_herbs','raw_herbs',2,'[]'::jsonb,'source',ARRAY['gathering']::text[],0,0,1,'Léčivé byliny'),
('smelt_tin','tin_ingot',2,'[{"key":"tin_ore","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'processing',ARRAY['smelting']::text[],0,0,1,'smelt_tin'),
('smelt_lead','lead_ingot',2,'[{"key":"lead_ore","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'processing',ARRAY['smelting']::text[],0,0,1,'smelt_lead'),
('smelt_silver','silver_ingot',1,'[{"key":"silver_ore","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'processing',ARRAY['smelting']::text[],0,0,1,'smelt_silver'),
('cast_bronze','bronze_ingot',3,'[{"key":"copper_ingot","kind":"material","qty":2},{"key":"tin_ingot","kind":"material","qty":1}]'::jsonb,'processing',ARRAY['smelting']::text[],0,0,1,'cast_bronze'),
('forge_bronze_tools','metalwork_tools',2,'[{"key":"bronze_ingot","kind":"material","qty":2},{"key":"lumber","kind":"material","qty":1}]'::jsonb,'urban',ARRAY['smithing']::text[],0,0,1,'forge_bronze_tools'),
('craft_silver_jewelry','jewelry',1,'[{"key":"silver_ingot","kind":"material","qty":2}]'::jsonb,'guild',ARRAY['master_craft']::text[],0,0,1,'craft_silver_jewelry'),
('saw_cedar','fine_lumber',2,'[{"key":"raw_cedar","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['sawing']::text[],0,0,1,'saw_cedar'),
('saw_hardwood','hardwood_lumber',2,'[{"key":"raw_hardwood","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['sawing']::text[],0,0,1,'saw_hardwood'),
('fire_bricks','bricks',3,'[{"key":"raw_clay","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'fire_bricks'),
('make_glass','glassware',2,'[{"key":"raw_sand","kind":"material","qty":3},{"key":"raw_limestone","kind":"material","qty":1},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'urban',ARRAY['glassmaking']::text[],0,0,1,'make_glass'),
('burn_lime','quicklime',2,'[{"key":"raw_limestone","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'processing',ARRAY['smelting']::text[],0,0,1,'burn_lime'),
('make_plaster','plaster',2,'[{"key":"raw_gypsum","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'make_plaster'),
('cut_marble','marble_blocks',2,'[{"key":"raw_marble","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'cut_marble'),
('cut_granite','granite_blocks',2,'[{"key":"raw_granite","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'cut_granite'),
('cut_sandstone','sandstone_blocks',2,'[{"key":"raw_sandstone","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'cut_sandstone'),
('knap_flint','stone_tools',3,'[{"key":"raw_flint","kind":"material","qty":2}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'knap_flint'),
('carve_obsidian','obsidian_tools',2,'[{"key":"raw_obsidian","kind":"material","qty":2}]'::jsonb,'processing',ARRAY['stonecutting']::text[],0,0,1,'carve_obsidian'),
('extract_pigment','pigments',2,'[{"key":"raw_ochre","kind":"material","qty":2}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'extract_pigment'),
('spin_hemp','yarn',3,'[{"key":"raw_hemp","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['spinning']::text[],0,0,1,'spin_hemp'),
('spin_cotton','cotton_yarn',2,'[{"key":"raw_cotton","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['spinning']::text[],0,0,1,'spin_cotton'),
('spin_wool','wool_yarn',2,'[{"key":"raw_wool","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['spinning']::text[],0,0,1,'spin_wool'),
('weave_cotton','textile_basic',2,'[{"key":"cotton_yarn","kind":"material","qty":2}]'::jsonb,'urban',ARRAY['weaving']::text[],0,0,1,'weave_cotton'),
('weave_wool','textile_basic',2,'[{"key":"wool_yarn","kind":"material","qty":2}]'::jsonb,'urban',ARRAY['weaving']::text[],0,0,1,'weave_wool'),
('make_rope','rope',2,'[{"key":"raw_hemp","kind":"material","qty":3}]'::jsonb,'processing',ARRAY['spinning']::text[],0,0,1,'make_rope'),
('scribe_papyrus','scribed_documents',2,'[{"key":"raw_papyrus","kind":"material","qty":2}]'::jsonb,'producer',ARRAY['crafting']::text[],0,0,1,'scribe_papyrus'),
('weave_reeds','basketry',3,'[{"key":"raw_reeds","kind":"material","qty":3}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'weave_reeds'),
('prepare_herbal','remedy_goods',2,'[{"key":"raw_herbs","kind":"material","qty":2}]'::jsonb,'guild',ARRAY['ritual_craft']::text[],0,0,1,'prepare_herbal'),
('craft_resin_incense','ritual_goods',2,'[{"key":"raw_resin","kind":"material","qty":2},{"key":"olive_oil","kind":"material","qty":1}]'::jsonb,'guild',ARRAY['ritual_craft']::text[],0,0,1,'craft_resin_incense'),
('refine_salt','refined_salt',3,'[{"key":"raw_salt","kind":"material","qty":3}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'refine_salt'),
('make_sulfur_pigment','sulfur_pigment',2,'[{"key":"raw_sulfur","kind":"material","qty":2}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'make_sulfur_pigment'),
('make_kaolin_pottery','pottery',2,'[{"key":"raw_kaolin","kind":"material","qty":3},{"key":"charcoal","kind":"operating","qty":1}]'::jsonb,'urban',ARRAY['crafting']::text[],0,0,1,'make_kaolin_pottery'),
('shear_sheep','raw_wool',2,'[]'::jsonb,'source',ARRAY['herding']::text[],0,0,1,'Vlna z živých ovcí')
ON CONFLICT(recipe_key) DO UPDATE SET output_good_key=excluded.output_good_key,output_quantity=excluded.output_quantity,input_items=excluded.input_items,required_role=excluded.required_role,required_tags=excluded.required_tags,description=excluded.description;
-- Repair impossible cross-smelting and stone-to-pottery transformation.
UPDATE production_recipes SET input_items='[{"key":"iron_ore","kind":"material","qty":2}]'::jsonb WHERE recipe_key='smelt_iron';
UPDATE production_recipes SET input_items='[{"key":"copper_ore","kind":"material","qty":2}]'::jsonb WHERE recipe_key='smelt_copper';
UPDATE production_recipes SET input_items='[{"key":"raw_clay","kind":"material","qty":2}]'::jsonb WHERE recipe_key='make_pottery';
UPDATE production_recipes SET output_good_key='raw_wool' WHERE recipe_key='herd_sheep';
-- Whitelist every compatible source/processor on EXISTING templates; selection of ONE rural
-- source is explicit in BUILD_BUILDING.payload.resourceRecipe, not passive multiple harvests.
WITH bindings(name,recipe,tag) AS (VALUES ('Důl','mine_iron','mining'),('Důl','mine_copper','mining'),('Důl','mine_tin','mining'),('Důl','mine_lead','mining'),('Důl','mine_silver','mining'),('Důl','mine_coal','mining'),('Důl','mine_salt','mining'),('Důl','mine_sulfur','mining'),('Kamenolom','quarry_granite','quarrying'),('Kamenolom','quarry_marble','quarrying'),('Kamenolom','quarry_limestone','quarrying'),('Kamenolom','quarry_sandstone','quarrying'),('Kamenolom','quarry_flint','quarrying'),('Kamenolom','quarry_obsidian','quarrying'),('Kamenolom','quarry_gypsum','quarrying'),('Kamenolom','dig_clay','quarrying'),('Kamenolom','dig_kaolin','quarrying'),('Kamenolom','collect_sand','quarrying'),('Kamenolom','quarry_ochre','quarrying'),('Dřevorubecký tábor','fell_cedar','logging'),('Dřevorubecký tábor','fell_hardwood','logging'),('Dřevorubecký tábor','tap_resin','logging'),('Farma','harvest_hemp','farming'),('Farma','harvest_cotton','farming'),('Farma','harvest_reeds','farming'),('Farma','harvest_papyrus','farming'),('Rašeliniště','collect_herbs','gathering'),('Huť','smelt_tin','smelting'),('Huť','smelt_lead','smelting'),('Huť','smelt_silver','smelting'),('Huť','cast_bronze','smelting'),('Kovárna','forge_bronze_tools','smithing'),('Klenotnická dílna','craft_silver_jewelry','master_craft'),('Pila','saw_cedar','sawing'),('Pila','saw_hardwood','sawing'),('Hrnčířská dílna','fire_bricks','crafting'),('Sklárna','make_glass','glassmaking'),('Huť','burn_lime','smelting'),('Kamenictví','make_plaster','stonecutting'),('Kamenictví','cut_marble','stonecutting'),('Kamenictví','cut_granite','stonecutting'),('Kamenictví','cut_sandstone','stonecutting'),('Kamenictví','knap_flint','stonecutting'),('Kamenictví','carve_obsidian','stonecutting'),('Hrnčířská dílna','extract_pigment','crafting'),('Přádelna','spin_hemp','spinning'),('Přádelna','spin_cotton','spinning'),('Přádelna','spin_wool','spinning'),('Tkalcovna','weave_cotton','weaving'),('Tkalcovna','weave_wool','weaving'),('Přádelna','make_rope','spinning'),('Písařská dílna','scribe_papyrus','crafting'),('Hrnčířská dílna','weave_reeds','crafting'),('Chrámová dílna','prepare_herbal','ritual_craft'),('Chrámová dílna','craft_resin_incense','ritual_craft'),('Hrnčířská dílna','refine_salt','crafting'),('Hrnčířská dílna','make_sulfur_pigment','crafting'),('Hrnčířská dílna','make_kaolin_pottery','crafting'),('Farma','shear_sheep','herding')), by_building AS (
 SELECT name,jsonb_agg(DISTINCT recipe ORDER BY recipe) recipes,
 array_agg(DISTINCT tag) tags FROM bindings GROUP BY name
)
UPDATE building_templates b SET effects=jsonb_set(
  jsonb_set(coalesce(b.effects,'{}'::jsonb),'{specialization_recipe_keys}',
   (SELECT coalesce(jsonb_agg(DISTINCT k ORDER BY k),'[]'::jsonb) FROM (
       SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(b.effects->'specialization_recipe_keys')='array' THEN b.effects->'specialization_recipe_keys' ELSE '[]'::jsonb END) k
       UNION ALL SELECT jsonb_array_elements_text(bb.recipes) k) united)),
  '{capability_tags}',
    (SELECT coalesce(jsonb_agg(DISTINCT k ORDER BY k),'[]'::jsonb) FROM (
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(b.effects->'capability_tags')='array' THEN b.effects->'capability_tags' ELSE '[]'::jsonb END) k
      UNION ALL SELECT unnest(bb.tags) k) allt)
  )
FROM by_building bb WHERE b.name=bb.name;
-- Sklárna was present in the building catalogue but had NO actual manufacturing contract.
UPDATE building_templates SET effects=effects || '{"production_roles":["urban"],"recipe_keys":["make_glass"],"capability_tags":["glassmaking"]}'::jsonb WHERE name='Sklárna';
COMMIT;
