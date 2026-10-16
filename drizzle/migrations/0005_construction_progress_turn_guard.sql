ALTER TABLE public.tile_infrastructure ADD COLUMN IF NOT EXISTS last_progress_turn integer;
ALTER TABLE public.road_projects ADD COLUMN IF NOT EXISTS last_progress_turn integer;