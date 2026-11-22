-- Textile material identity (additive, forward-only, idempotent).
-- Hemp, cotton and wool cloth become their own tradeable goods instead of all collapsing into
-- textile_basic. textile_basic and yarn stay the legacy flax/linen line: existing stocks,
-- recipes (weave_basic, weave_fine, embroider_fine) and committed ledgers keep working; no row
-- is deleted or renamed. Mirror: supabase/functions/_shared/materialResources.ts.

-- 1) New goods (copy physical attributes of the legacy rows; no stock is created).
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band,
  base_price_numeric, demand_basket, substitution_map, storable, icon, description, friction_profile)
SELECT v.key, v.label, b.category, v.stage, b.market_tier, b.base_price_band, v.price, 'basic_clothing',
  '{}'::jsonb, true, b.icon, v.descr,
  jsonb_build_object('final_use', v.final_use, 'household', false, 'bulk_factor', 1, 'perishability', 0)
FROM (VALUES
  ('hemp_yarn',      'Konopná příze',  'processed', 0.9, false, 'Příze z konopí; vstup jen pro tkaní konopného plátna.', 'yarn'),
  ('textile_hemp',   'Konopné plátno', 'final',     1.6, true,  'Hrubé konopné plátno pro základní oděv.',             'textile_basic'),
  ('textile_cotton', 'Bavlněná látka', 'final',     2.2, true,  'Lehká bavlněná látka pro základní oděv.',             'textile_basic'),
  ('textile_wool',   'Vlněné sukno',   'final',     2.0, true,  'Teplé vlněné sukno pro základní oděv.',              'textile_basic')
) AS v(key, label, stage, price, final_use, descr, base_key)
JOIN public.goods b ON b.key = v.base_key
WHERE NOT EXISTS (SELECT 1 FROM public.goods g WHERE g.key = v.key);

-- 2) Recipes keep their keys; only the output identity changes (future production only).
UPDATE public.production_recipes SET output_good_key = 'hemp_yarn'
  WHERE recipe_key = 'spin_hemp' AND output_good_key = 'yarn';
UPDATE public.production_recipes SET output_good_key = 'textile_cotton'
  WHERE recipe_key = 'weave_cotton' AND output_good_key = 'textile_basic';
UPDATE public.production_recipes SET output_good_key = 'textile_wool'
  WHERE recipe_key = 'weave_wool' AND output_good_key = 'textile_basic';

-- 3) New hemp weaving recipe (same shape as weave_cotton).
INSERT INTO public.production_recipes (recipe_key, output_good_key, output_quantity, input_items,
  required_role, required_tags, min_quality_input, quality_output_bonus, labor_cost, description)
SELECT 'weave_hemp', 'textile_hemp', 2, '[{"key":"hemp_yarn","qty":2,"kind":"material"}]'::jsonb,
  'urban', ARRAY['weaving'], 0, 0, 1, 'Tkaní konopného plátna z konopné příze.'
WHERE NOT EXISTS (SELECT 1 FROM public.production_recipes WHERE recipe_key = 'weave_hemp');

-- 4) The weaving workshop may specialise in hemp cloth (one specialisation per site, as before).
UPDATE public.building_templates
SET effects = jsonb_set(effects, '{specialization_recipe_keys}',
  COALESCE(effects->'specialization_recipe_keys', '[]'::jsonb) || '["weave_hemp"]'::jsonb)
WHERE name = 'Tkalcovna'
  AND NOT (COALESCE(effects->'specialization_recipe_keys', '[]'::jsonb) ? 'weave_hemp');
