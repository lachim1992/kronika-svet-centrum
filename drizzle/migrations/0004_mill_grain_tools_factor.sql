-- Economy 2.0 A/B/C: mill_grain keeps grain as A (material) and gains metalwork_tools as B (durable factor, 5% wear per batch). Mirrors productionCatalog.ts.
UPDATE public.production_recipes
SET input_items = '[{"key":"raw_grain","qty":3,"kind":"material"},{"key":"metalwork_tools","qty":1,"kind":"factor","wear":0.05}]'::jsonb
WHERE recipe_key = 'mill_grain';