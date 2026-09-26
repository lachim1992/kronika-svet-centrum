UPDATE public.building_templates SET required_settlement_level = CASE upper(trim(required_settlement_level))
    WHEN 'VILLAGE' THEN 'TOWNSHIP' WHEN 'TOWN' THEN 'CITY' ELSE upper(trim(required_settlement_level)) END
WHERE required_settlement_level IS NOT NULL
  AND required_settlement_level <> CASE upper(trim(required_settlement_level))
    WHEN 'VILLAGE' THEN 'TOWNSHIP' WHEN 'TOWN' THEN 'CITY' ELSE upper(trim(required_settlement_level)) END;

WITH src AS (
  SELECT array_agg(recipe_key) AS keys FROM public.production_recipes
  WHERE required_role = 'source' AND coalesce(jsonb_array_length(to_jsonb(input_items)), 0) = 0
)
UPDATE public.building_templates t
SET effects = jsonb_set(t.effects, '{production_roles}',
      (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(t.effects->'production_roles') r WHERE r <> '"producer"')
      || CASE WHEN t.effects->'production_roles' ? 'source' THEN '[]'::jsonb ELSE '["source"]'::jsonb END)
FROM src
WHERE jsonb_typeof(t.effects->'recipe_keys') = 'array'
  AND jsonb_typeof(t.effects->'production_roles') = 'array'
  AND t.effects->'production_roles' ? 'producer'
  AND jsonb_array_length(t.effects->'recipe_keys') > 0
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.effects->'recipe_keys') k WHERE NOT (k = ANY(src.keys)));

WITH src AS (
  SELECT array_agg(recipe_key) AS keys FROM public.production_recipes
  WHERE required_role = 'source' AND coalesce(jsonb_array_length(to_jsonb(input_items)), 0) = 0
)
UPDATE public.city_buildings b
SET effects = jsonb_set(b.effects, '{production_roles}',
      (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(b.effects->'production_roles') r WHERE r <> '"producer"')
      || CASE WHEN b.effects->'production_roles' ? 'source' THEN '[]'::jsonb ELSE '["source"]'::jsonb END)
FROM src
WHERE jsonb_typeof(b.effects->'recipe_keys') = 'array'
  AND jsonb_typeof(b.effects->'production_roles') = 'array'
  AND b.effects->'production_roles' ? 'producer'
  AND jsonb_array_length(b.effects->'recipe_keys') > 0
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.effects->'recipe_keys') k WHERE NOT (k = ANY(src.keys)));

WITH src AS (
  SELECT array_agg(recipe_key) AS keys FROM public.production_recipes
  WHERE required_role = 'source' AND coalesce(jsonb_array_length(to_jsonb(input_items)), 0) = 0
)
UPDATE public.building_templates t
SET level_data = (
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(l->'effects'->'production_roles') = 'array'
      AND (l->'effects'->'production_roles') ? 'producer'
      AND jsonb_typeof(l->'effects'->'recipe_keys') = 'array'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(l->'effects'->'recipe_keys') k WHERE NOT (k = ANY(src.keys)))
    THEN jsonb_set(l, '{effects,production_roles}',
      (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(l->'effects'->'production_roles') r WHERE r <> '"producer"')
      || CASE WHEN (l->'effects'->'production_roles') ? 'source' THEN '[]'::jsonb ELSE '["source"]'::jsonb END)
    ELSE l END ORDER BY ord)
  FROM jsonb_array_elements(t.level_data) WITH ORDINALITY AS e(l, ord), src)
WHERE jsonb_typeof(t.level_data) = 'array' AND jsonb_array_length(t.level_data) > 0;