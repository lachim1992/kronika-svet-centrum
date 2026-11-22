-- Existing legacy resource-type descriptions were incorrectly stored as macro biome labels.
-- Align the reference catalogue with actual persisted 6x6 microparcel.sub_biome keys.
WITH normalized(key,biomes) AS (VALUES ('wheat',ARRAY['fertile_flat','fertile_silt','raised_bank','terrace','grassland']::text[]),
('barley',ARRAY['grassland','clearing','fertile_flat','hillock']::text[]),
('rice',ARRAY['reed_marsh','boggy_dip','fertile_silt','creek_bank']::text[]),
('cattle',ARRAY['grassland','clearing','fertile_flat']::text[]),
('sheep',ARRAY['grassland','hillock','saddle','ridge_woods']::text[]),
('fish',ARRAY['shore','harbour_flat','creek_bank','open_water']::text[]),
('cedar',ARRAY['dense_forest','ridge_woods']::text[]),
('flax',ARRAY['fertile_flat','fertile_silt','creek_bank','grassland']::text[]),
('gold_ore',ARRAY['hillock','saddle','cliff_edge','steep_slope']::text[]),
('grapes',ARRAY['terrace','sheltered_hollow','hillock']::text[]),
('incense_resin',ARRAY['dense_forest','ridge_woods','clearing']::text[]),
('marble',ARRAY['cliff_edge','terrace','hillock']::text[]),
('olives',ARRAY['terrace','sheltered_hollow','shore']::text[]),
('stone',ARRAY['hillock','cliff_edge','steep_slope','saddle','permafrost_rise']::text[]),
('timber',ARRAY['dense_forest','ridge_woods']::text[]),
('wool_raw',ARRAY[]::text[]))
UPDATE resource_types r SET spawn_biomes=n.biomes FROM normalized n WHERE r.key=n.key;
UPDATE resource_types SET description='Vlna není samostatný přírodní nález. Vzniká chovem ovcí a recepturou shear_sheep.',replicable=true,spawn_biomes='{}'::text[] WHERE key='wool_raw';
UPDATE resource_types SET category='fuel' WHERE key='raw_coal';
