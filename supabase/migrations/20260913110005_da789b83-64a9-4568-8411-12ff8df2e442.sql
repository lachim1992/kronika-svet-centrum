ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS parcel_index integer;

ALTER TABLE public.military_stacks
  ADD CONSTRAINT military_stacks_parcel_index_range
  CHECK (parcel_index IS NULL OR (parcel_index >= 0 AND parcel_index < 36));

COMMENT ON COLUMN public.military_stacks.parcel_index IS 'Optional 0..35 sub-parcel of the tile (6x6 grid) where the army camps. Movement stays on the main square grid.';