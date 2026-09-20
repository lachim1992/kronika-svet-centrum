-- Use concrete catalogue inputs. The previous compatibility migration used the
-- nonexistent legacy key 'timber', leaving both recipes permanently blocked.
UPDATE public.production_recipes
SET input_items = '[{"key":"raw_timber","qty":2}]'::jsonb
WHERE recipe_key = 'burn_charcoal'
  AND (input_items = '[]'::jsonb OR input_items = '[{"key":"timber","qty":2}]'::jsonb);

UPDATE public.production_recipes
SET input_items = '[{"key":"lumber","qty":2}]'::jsonb
WHERE recipe_key = 'build_granary'
  AND (input_items = '[]'::jsonb OR input_items = '[{"key":"timber","qty":2}]'::jsonb);
