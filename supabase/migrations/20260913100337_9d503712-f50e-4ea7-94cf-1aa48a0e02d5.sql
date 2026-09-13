CREATE TABLE public.tile_parcels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  grid_x INTEGER NOT NULL,
  grid_y INTEGER NOT NULL,
  parcel_index INTEGER NOT NULL,
  parcel_x INTEGER NOT NULL,
  parcel_y INTEGER NOT NULL,
  sub_biome TEXT NOT NULL DEFAULT 'open_ground',
  elevation INTEGER NOT NULL DEFAULT 40,
  buildable BOOLEAN NOT NULL DEFAULT true,
  build_cost_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  capacity_slots INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'wild',
  land_use TEXT NOT NULL DEFAULT 'open',
  owner_player TEXT,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  building_id UUID REFERENCES public.city_buildings(id) ON DELETE SET NULL,
  district_id UUID REFERENCES public.city_districts(id) ON DELETE SET NULL,
  claimed_turn INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT tile_parcels_index_range CHECK (parcel_index >= 0 AND parcel_index < 32),
  CONSTRAINT tile_parcels_status_valid CHECK (status IN ('wild','claimed','occupied','blocked')),
  CONSTRAINT tile_parcels_unique UNIQUE (session_id, grid_x, grid_y, parcel_index)
);

GRANT SELECT ON public.tile_parcels TO authenticated;
GRANT ALL ON public.tile_parcels TO service_role;

ALTER TABLE public.tile_parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game members can view tile parcels" ON public.tile_parcels
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.game_memberships gm WHERE gm.session_id = tile_parcels.session_id AND gm.user_id = auth.uid()));

CREATE INDEX idx_tile_parcels_cell ON public.tile_parcels (session_id, grid_x, grid_y);
CREATE INDEX idx_tile_parcels_city ON public.tile_parcels (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX idx_tile_parcels_owner ON public.tile_parcels (session_id, owner_player) WHERE owner_player IS NOT NULL;

CREATE TRIGGER update_tile_parcels_updated_at
BEFORE UPDATE ON public.tile_parcels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS founded_parcel_index INTEGER;

COMMENT ON TABLE public.tile_parcels IS 'Deterministic 32 sub-parcels per map cell (8x4). Materialized lazily; layout derives from session seed + cell terrain and never changes once created.';
COMMENT ON COLUMN public.cities.founded_parcel_index IS 'Sub-parcel (0-31) inside the city cell where the settlement was founded; drives marker offset on the world map.';