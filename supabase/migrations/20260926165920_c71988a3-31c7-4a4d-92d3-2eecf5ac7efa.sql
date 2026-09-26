-- Zero-input extraction recipes are 'source'. Saved templates/buildings that whitelist such a
-- recipe but only declare 'producer' get 'source' appended (other roles/effects preserved).
WITH src AS (
  SELECT array_agg(recipe_key) keys FROM public.production_recipes
  WHERE required_role='source' AND coalesce(jsonb_array_length(to_jsonb(input_items)),0)=0
)
UPDATE public.building_templates t
SET effects = jsonb_set(t.effects,'{production_roles}',coalesce(t.effects->'production_roles','[]'::jsonb)||'["source"]'::jsonb)
FROM src
WHERE t.effects ? 'recipe_keys'
  AND NOT coalesce(t.effects->'production_roles','[]'::jsonb) ? 'source'
  AND jsonb_typeof(t.effects->'production_roles') IS DISTINCT FROM 'string'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.effects->'recipe_keys') k WHERE k = ANY(src.keys))
  AND jsonb_typeof(t.effects->'production_roles') = 'array';

WITH src AS (
  SELECT array_agg(recipe_key) keys FROM public.production_recipes
  WHERE required_role='source' AND coalesce(jsonb_array_length(to_jsonb(input_items)),0)=0
)
UPDATE public.city_buildings b
SET effects = jsonb_set(b.effects,'{production_roles}',b.effects->'production_roles'||'["source"]'::jsonb)
FROM src
WHERE jsonb_typeof(b.effects->'recipe_keys')='array'
  AND jsonb_typeof(b.effects->'production_roles')='array'
  AND NOT b.effects->'production_roles' ? 'source'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.effects->'recipe_keys') k WHERE k = ANY(src.keys));