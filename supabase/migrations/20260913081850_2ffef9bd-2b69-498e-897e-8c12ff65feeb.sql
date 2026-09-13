ALTER TABLE public.world_foundations
  ADD COLUMN IF NOT EXISTS grid_kind text NOT NULL DEFAULT 'hex6',
  ADD COLUMN IF NOT EXISTS grid_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT world_foundations_grid_kind_check CHECK (grid_kind IN ('hex6', 'square4')),
  ADD CONSTRAINT world_foundations_grid_version_check CHECK (grid_version >= 1);

ALTER TABLE public.province_hexes
  ADD COLUMN IF NOT EXISTS grid_x integer,
  ADD COLUMN IF NOT EXISTS grid_y integer;

ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS grid_x integer,
  ADD COLUMN IF NOT EXISTS grid_y integer;

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS grid_x integer,
  ADD COLUMN IF NOT EXISTS grid_y integer;

ALTER TABLE public.provinces
  ADD COLUMN IF NOT EXISTS center_x integer,
  ADD COLUMN IF NOT EXISTS center_y integer;

ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS grid_x integer,
  ADD COLUMN IF NOT EXISTS grid_y integer;

ALTER TABLE public.flow_paths
  ADD COLUMN IF NOT EXISTS path_cells jsonb;

ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS planned_path_cells jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_province_hexes_square_coords
  ON public.province_hexes (session_id, grid_x, grid_y)
  WHERE grid_x IS NOT NULL AND grid_y IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_province_nodes_square_coords
  ON public.province_nodes (session_id, grid_x, grid_y)
  WHERE grid_x IS NOT NULL AND grid_y IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cities_square_coords
  ON public.cities (session_id, grid_x, grid_y)
  WHERE grid_x IS NOT NULL AND grid_y IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_military_stacks_square_coords
  ON public.military_stacks (session_id, grid_x, grid_y)
  WHERE grid_x IS NOT NULL AND grid_y IS NOT NULL;

COMMENT ON COLUMN public.world_foundations.grid_kind IS 'Immutable world topology: hex6 for legacy worlds, square4 for cardinal square-grid worlds.';
COMMENT ON COLUMN public.world_foundations.grid_version IS 'Version of the spatial coordinate and path contract.';
COMMENT ON COLUMN public.flow_paths.path_cells IS 'Topology-neutral ordered path cells; square4 entries use x/y and hex6 entries use q/r.';
COMMENT ON COLUMN public.province_routes.planned_path_cells IS 'Topology-neutral planned path cells, parallel to legacy planned_hex_path.';