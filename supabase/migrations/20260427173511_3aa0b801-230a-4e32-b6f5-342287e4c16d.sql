-- Phase B: hydrate missing baskets — fixed types
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, storable, description)
VALUES
  ('charcoal',          'Dřevěné uhlí',       'craft',        'processed', 'common', 0, 2, 'fuel',              true,  'Základní palivo pro kovárny a topení.'),
  ('peat',              'Rašelina',           'raw',          'raw',       'common', 0, 1, 'fuel',              true,  'Sušená rašelina jako levné palivo.'),
  ('well_water',        'Studniční voda',     'food',         'raw',       'common', 0, 1, 'drinking_water',    false, 'Pitná voda ze studní a cisteren.'),
  ('scribed_documents', 'Spisy a pergameny',  'craft',        'processed', 'common', 1, 4, 'admin_supplies',    true,  'Pergameny, inkousty, úřední spisy.'),
  ('granary_storage',   'Skladovací kapacita','construction', 'processed', 'common', 1, 3, 'storage_logistics', true,  'Sýpky, sklady, logistická kapacita.')
ON CONFLICT (key) DO UPDATE SET
  demand_basket = EXCLUDED.demand_basket,
  display_name = EXCLUDED.display_name;

INSERT INTO public.production_recipes (recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, min_quality_input, quality_output_bonus, labor_cost, description)
VALUES
  ('burn_charcoal',     'charcoal',          3, '[]'::jsonb, 'producer', ARRAY['logging']::text[],      0, 0, 1, 'Pálení uhlí v lese'),
  ('cut_peat',          'peat',              2, '[]'::jsonb, 'producer', ARRAY['gathering']::text[],    0, 0, 1, 'Těžba rašeliny'),
  ('draw_water',        'well_water',        4, '[]'::jsonb, 'producer', ARRAY['farming']::text[],      0, 0, 1, 'Studny a cisterny u sídel'),
  ('scribe_documents',  'scribed_documents', 1, '[]'::jsonb, 'producer', ARRAY['crafting']::text[],     0, 0, 2, 'Písaři a úředníci'),
  ('build_granary',     'granary_storage',   2, '[]'::jsonb, 'producer', ARRAY['construction']::text[], 0, 0, 1, 'Sýpky a sklady')
ON CONFLICT (recipe_key) DO UPDATE SET
  required_tags = EXCLUDED.required_tags,
  output_quantity = EXCLUDED.output_quantity;

UPDATE public.goods SET demand_basket = 'admin_supplies'  WHERE key = 'ritual_goods';
UPDATE public.goods SET demand_basket = 'metalwork'       WHERE key = 'raw_ore';
UPDATE public.goods SET demand_basket = 'tools'           WHERE key IN ('iron_ingot', 'copper_ingot', 'metalwork_tools');
UPDATE public.goods SET demand_basket = 'basic_clothing'  WHERE key IN ('textile_basic', 'yarn', 'raw_fiber', 'leather', 'raw_hide');
UPDATE public.goods SET demand_basket = 'luxury_clothing' WHERE key IN ('textile_fine', 'jewelry');
UPDATE public.goods SET demand_basket = 'feast'           WHERE key IN ('wine_luxury', 'wine_standard', 'feast_goods', 'baked_refined');