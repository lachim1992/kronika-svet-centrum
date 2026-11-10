INSERT INTO public.production_recipes (recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, min_quality_input, quality_output_bonus, labor_cost, description)
SELECT * FROM (VALUES
 ('draw_river_water','well_water',4::numeric,'[]'::jsonb,'source','{river_access}'::text[],0::numeric,0::numeric,1::numeric,'Odběr sladké vody ze sousední řeky'),
 ('hunt_game','raw_meat',2::numeric,'[]'::jsonb,'source','{hunting}'::text[],0::numeric,0::numeric,1::numeric,'Lov zvěře a sběr v divočině')
) v
ON CONFLICT (recipe_key) DO NOTHING;