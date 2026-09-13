CREATE TABLE public.city_urban_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  grid_x integer NOT NULL,
  grid_y integer NOT NULL,
  cell_role text NOT NULL DEFAULT 'core' CHECK (cell_role IN ('core', 'expansion')),
  status text NOT NULL DEFAULT 'urbanized' CHECK (status IN ('developing', 'urbanized')),
  claim_order integer NOT NULL DEFAULT 0 CHECK (claim_order >= 0),
  development_progress integer NOT NULL DEFAULT 100 CHECK (development_progress BETWEEN 0 AND 100),
  development_turns integer NOT NULL DEFAULT 0 CHECK (development_turns >= 0),
  started_turn integer,
  completed_turn integer,
  cost_gold integer NOT NULL DEFAULT 0 CHECK (cost_gold >= 0),
  cost_production integer NOT NULL DEFAULT 0 CHECK (cost_production >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, grid_x, grid_y),
  UNIQUE (city_id, claim_order)
);
GRANT SELECT ON public.city_urban_cells TO authenticated;
GRANT ALL ON public.city_urban_cells TO service_role;
ALTER TABLE public.city_urban_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view urban cells" ON public.city_urban_cells FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.game_memberships gm WHERE gm.session_id = city_urban_cells.session_id AND gm.user_id = auth.uid()));

CREATE TABLE public.city_parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  urban_cell_id uuid NOT NULL REFERENCES public.city_urban_cells(id) ON DELETE CASCADE,
  parcel_x smallint NOT NULL CHECK (parcel_x BETWEEN 0 AND 3),
  parcel_y smallint NOT NULL CHECK (parcel_y BETWEEN 0 AND 3),
  land_use text NOT NULL DEFAULT 'open' CHECK (land_use IN ('open', 'residential', 'commercial', 'industrial', 'civic', 'military', 'sacred', 'infrastructure')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('locked', 'open', 'reserved', 'occupied')),
  building_id uuid REFERENCES public.city_buildings(id) ON DELETE SET NULL,
  district_id uuid REFERENCES public.city_districts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (urban_cell_id, parcel_x, parcel_y),
  CHECK (NOT (building_id IS NOT NULL AND district_id IS NOT NULL))
);
GRANT SELECT ON public.city_parcels TO authenticated;
GRANT ALL ON public.city_parcels TO service_role;
ALTER TABLE public.city_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members can view city parcels" ON public.city_parcels FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.game_memberships gm WHERE gm.session_id = city_parcels.session_id AND gm.user_id = auth.uid()));

ALTER TABLE public.city_buildings ADD COLUMN parcel_id uuid REFERENCES public.city_parcels(id) ON DELETE SET NULL;
ALTER TABLE public.city_districts ADD COLUMN parcel_id uuid REFERENCES public.city_parcels(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX city_buildings_parcel_unique ON public.city_buildings(parcel_id) WHERE parcel_id IS NOT NULL;
CREATE UNIQUE INDEX city_districts_parcel_unique ON public.city_districts(parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX city_urban_cells_city_idx ON public.city_urban_cells(city_id, status);
CREATE INDEX city_parcels_city_idx ON public.city_parcels(city_id, status);
CREATE TRIGGER update_city_urban_cells_updated_at BEFORE UPDATE ON public.city_urban_cells FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_city_parcels_updated_at BEFORE UPDATE ON public.city_parcels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.city_urban_cells (session_id, city_id, grid_x, grid_y, cell_role, status, claim_order, development_progress, completed_turn)
SELECT c.session_id, c.id, COALESCE(c.grid_x, c.province_q), COALESCE(c.grid_y, c.province_r), 'core', 'urbanized', 0, 100, c.founded_round
FROM public.cities c
ON CONFLICT (session_id, grid_x, grid_y) DO NOTHING;

INSERT INTO public.city_parcels (session_id, city_id, urban_cell_id, parcel_x, parcel_y, land_use, status)
SELECT u.session_id, u.city_id, u.id, px, py,
  CASE WHEN px IN (1,2) AND py IN (1,2) THEN 'civic' ELSE 'residential' END,
  'open'
FROM public.city_urban_cells u
CROSS JOIN generate_series(0,3) AS px
CROSS JOIN generate_series(0,3) AS py
ON CONFLICT (urban_cell_id, parcel_x, parcel_y) DO NOTHING;