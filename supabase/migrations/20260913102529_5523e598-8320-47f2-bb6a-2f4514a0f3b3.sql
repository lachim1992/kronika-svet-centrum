ALTER TABLE public.tile_parcels DROP CONSTRAINT tile_parcels_index_range;
ALTER TABLE public.tile_parcels ADD CONSTRAINT tile_parcels_index_range CHECK (parcel_index >= 0 AND parcel_index < 36);
DELETE FROM public.tile_parcels WHERE parcel_index >= 0;
UPDATE public.cities SET founded_parcel_index = NULL WHERE founded_parcel_index IS NOT NULL;