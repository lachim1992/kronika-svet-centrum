ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS parcel_index integer;

ALTER TABLE public.province_nodes
  ADD CONSTRAINT province_nodes_parcel_index_range
  CHECK (parcel_index IS NULL OR (parcel_index >= 0 AND parcel_index < 36));

COMMENT ON COLUMN public.province_nodes.parcel_index IS 'Optional 0..35 sub-parcel of the tile (6x6 grid) where the node compound stands.';