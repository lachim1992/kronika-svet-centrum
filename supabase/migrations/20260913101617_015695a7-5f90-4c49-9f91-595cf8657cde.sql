ALTER TABLE public.city_buildings DROP COLUMN IF EXISTS parcel_id;
ALTER TABLE public.city_districts DROP COLUMN IF EXISTS parcel_id;

DROP TABLE IF EXISTS public.city_parcels CASCADE;
DROP TABLE IF EXISTS public.city_urban_cells CASCADE;

ALTER TABLE public.city_buildings ADD COLUMN parcel_id UUID REFERENCES public.tile_parcels(id) ON DELETE SET NULL;
ALTER TABLE public.city_districts ADD COLUMN parcel_id UUID REFERENCES public.tile_parcels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_city_buildings_parcel ON public.city_buildings (parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_city_districts_parcel ON public.city_districts (parcel_id) WHERE parcel_id IS NOT NULL;

COMMENT ON COLUMN public.city_buildings.parcel_id IS 'Sub-parcel (tile_parcels) physically occupied by this building.';
COMMENT ON COLUMN public.city_districts.parcel_id IS 'Sub-parcel (tile_parcels) physically occupied by this district.';