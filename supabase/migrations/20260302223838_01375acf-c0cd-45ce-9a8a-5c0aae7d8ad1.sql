
-- Add river and bridge support to province_hexes
ALTER TABLE public.province_hexes ADD COLUMN has_river boolean NOT NULL DEFAULT false;
ALTER TABLE public.province_hexes ADD COLUMN has_bridge boolean NOT NULL DEFAULT false;
ALTER TABLE public.province_hexes ADD COLUMN is_passable boolean NOT NULL DEFAULT true;
ALTER TABLE public.province_hexes ADD COLUMN movement_cost integer NOT NULL DEFAULT 1;
ALTER TABLE public.province_hexes ADD COLUMN river_direction text DEFAULT NULL;

-- Add indexes for pathfinding queries
CREATE INDEX idx_province_hexes_passability ON public.province_hexes (session_id, is_passable) WHERE is_passable = false;
CREATE INDEX idx_province_hexes_river ON public.province_hexes (session_id, has_river) WHERE has_river = true;

-- Update existing hexes: mark sea and mountains as impassable
UPDATE public.province_hexes SET is_passable = false, movement_cost = 0 WHERE biome_family IN ('sea', 'mountains');
