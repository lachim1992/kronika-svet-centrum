-- Economy 2.0 phase 2: bake_staples burns peat OR charcoal (C operating, staged fallback 0.8 = open hearth).
-- Idempotent: only rewrites the legacy flour-only BOM. Mirrors productionCatalog.ts.
update public.production_recipes
set input_items = '[{"key":"flour","qty":2,"kind":"material"},{"key":"peat","qty":1,"kind":"operating","fallback":0.8},{"key":"charcoal","qty":1,"kind":"operating","fallback":0.8}]'::jsonb
where recipe_key = 'bake_staples' and input_items = '[{"key":"flour","qty":2}]'::jsonb;
