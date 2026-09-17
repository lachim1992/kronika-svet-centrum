ALTER TABLE public.road_projects
  ADD COLUMN IF NOT EXISTS sub_path_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.road_segments
  ADD COLUMN IF NOT EXISTS sub_path_cells jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP TRIGGER IF EXISTS update_road_projects_updated_at ON public.road_projects;
CREATE TRIGGER update_road_projects_updated_at
BEFORE UPDATE ON public.road_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();