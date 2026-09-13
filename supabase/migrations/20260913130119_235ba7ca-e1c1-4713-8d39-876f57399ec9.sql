CREATE TABLE public.tile_parcel_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL REFERENCES public.tile_parcels(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  slots_used integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tile_parcel_contents_entity_type_valid CHECK (entity_type IN ('building','district','node')),
  CONSTRAINT tile_parcel_contents_slots_valid CHECK (slots_used >= 1 AND slots_used <= 3),
  CONSTRAINT tile_parcel_contents_entity_unique UNIQUE (entity_type, entity_id)
);
GRANT SELECT ON public.tile_parcel_contents TO authenticated;
GRANT ALL ON public.tile_parcel_contents TO service_role;
ALTER TABLE public.tile_parcel_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view parcel contents" ON public.tile_parcel_contents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.game_memberships gm
  WHERE gm.session_id = tile_parcel_contents.session_id AND gm.user_id = auth.uid()
));
CREATE INDEX idx_tile_parcel_contents_parcel ON public.tile_parcel_contents(parcel_id);
CREATE INDEX idx_tile_parcel_contents_session ON public.tile_parcel_contents(session_id);
CREATE TRIGGER update_tile_parcel_contents_updated_at
BEFORE UPDATE ON public.tile_parcel_contents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tile_infrastructure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  grid_x integer NOT NULL,
  grid_y integer NOT NULL,
  owner_player text NOT NULL,
  level integer NOT NULL DEFAULT 0,
  target_level integer,
  status text NOT NULL DEFAULT 'none',
  progress integer NOT NULL DEFAULT 0,
  started_turn integer,
  completed_turn integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tile_infrastructure_level_valid CHECK (level >= 0 AND level <= 3),
  CONSTRAINT tile_infrastructure_target_valid CHECK (target_level IS NULL OR (target_level >= 1 AND target_level <= 3)),
  CONSTRAINT tile_infrastructure_status_valid CHECK (status IN ('none','building','completed')),
  CONSTRAINT tile_infrastructure_progress_valid CHECK (progress >= 0 AND progress <= 100),
  CONSTRAINT tile_infrastructure_cell_unique UNIQUE (session_id, grid_x, grid_y)
);
GRANT SELECT ON public.tile_infrastructure TO authenticated;
GRANT ALL ON public.tile_infrastructure TO service_role;
ALTER TABLE public.tile_infrastructure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view tile infrastructure" ON public.tile_infrastructure
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.game_memberships gm
  WHERE gm.session_id = tile_infrastructure.session_id AND gm.user_id = auth.uid()
));
CREATE INDEX idx_tile_infrastructure_owner ON public.tile_infrastructure(session_id, owner_player);
CREATE TRIGGER update_tile_infrastructure_updated_at
BEFORE UPDATE ON public.tile_infrastructure
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tile_parcel_contents IS 'Multiple physical buildings, districts, or subnodes sharing one 6x6 tile parcel within its slot capacity.';
COMMENT ON TABLE public.tile_infrastructure IS 'Three-level local trail and road infrastructure inside one square-grid cell; independent from authoritative inter-cell flow paths.';