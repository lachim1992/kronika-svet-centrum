UPDATE public.province_hexes SET grid_x = q, grid_y = r WHERE grid_x IS NULL OR grid_y IS NULL;

UPDATE public.cities SET grid_x = province_q, grid_y = province_r WHERE (grid_x IS NULL OR grid_y IS NULL) AND province_q IS NOT NULL AND province_r IS NOT NULL;

UPDATE public.province_nodes SET grid_x = hex_q, grid_y = hex_r WHERE (grid_x IS NULL OR grid_y IS NULL) AND hex_q IS NOT NULL AND hex_r IS NOT NULL;

UPDATE public.military_stacks SET grid_x = hex_q, grid_y = hex_r WHERE (grid_x IS NULL OR grid_y IS NULL) AND hex_q IS NOT NULL AND hex_r IS NOT NULL;

UPDATE public.flow_paths
SET path_cells = (
  SELECT jsonb_agg(jsonb_build_object('x', (elem->>'q')::int, 'y', (elem->>'r')::int) ORDER BY ord)
  FROM jsonb_array_elements(hex_path::jsonb) WITH ORDINALITY AS t(elem, ord)
  WHERE elem ? 'q' AND elem ? 'r'
)
WHERE path_cells IS NULL AND hex_path IS NOT NULL;

UPDATE public.world_foundations SET grid_kind = 'square4', grid_version = 2 WHERE grid_kind IS DISTINCT FROM 'square4';