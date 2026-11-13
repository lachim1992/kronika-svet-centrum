CREATE TABLE public.territory_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  owner_player text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 48),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('forest','meadow','mine','desert','other')),
  created_turn int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.territory_district_parcels (
  district_id uuid NOT NULL REFERENCES public.territory_districts(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL UNIQUE REFERENCES public.tile_parcels(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  PRIMARY KEY (district_id, parcel_id)
);
CREATE INDEX ON public.territory_districts(session_id, city_id);
CREATE INDEX ON public.territory_district_parcels(session_id);
GRANT SELECT ON public.territory_districts, public.territory_district_parcels TO authenticated;
GRANT ALL ON public.territory_districts, public.territory_district_parcels TO service_role;
ALTER TABLE public.territory_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territory_district_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read districts" ON public.territory_districts FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));
CREATE POLICY "members read district parcels" ON public.territory_district_parcels FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.district_parcel_check(p_session uuid, p_player text, p_parcel uuid) RETURNS tile_parcels
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p tile_parcels;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT * INTO p FROM tile_parcels WHERE id=p_parcel AND session_id=p_session FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela neexistuje'; END IF;
 IF p.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Parcela vám nepatří'; END IF;
 IF p.claim_kind IS DISTINCT FROM 'worked' THEN RAISE EXCEPTION 'Distrikt tvoří jen využívaná (venkovská) půda'; END IF;
 IF p.city_id IS NULL THEN RAISE EXCEPTION 'Parcela nepatří žádnému městu'; END IF;
 IF EXISTS(SELECT 1 FROM territory_district_parcels WHERE parcel_id=p_parcel) THEN RAISE EXCEPTION 'Parcela už patří do distriktu'; END IF;
 RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.create_territory_district(p_session uuid, p_player text, p_parcel uuid, p_name text, p_kind text, p_turn int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p tile_parcels; v_id uuid;
BEGIN
 p := public.district_parcel_check(p_session, p_player, p_parcel);
 INSERT INTO territory_districts(session_id, city_id, owner_player, name, kind, created_turn)
   VALUES (p_session, p.city_id, p_player, btrim(p_name), coalesce(nullif(p_kind,''),'other'), p_turn) RETURNING id INTO v_id;
 INSERT INTO territory_district_parcels(district_id, parcel_id, session_id) VALUES (v_id, p.id, p_session);
 RETURN jsonb_build_object('districtId', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.add_parcel_to_district(p_session uuid, p_player text, p_district uuid, p_parcel uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p tile_parcels; d territory_districts;
BEGIN
 SELECT * INTO d FROM territory_districts WHERE id=p_district AND session_id=p_session FOR UPDATE;
 IF d.id IS NULL OR d.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Distrikt vám nepatří'; END IF;
 p := public.district_parcel_check(p_session, p_player, p_parcel);
 IF p.city_id IS DISTINCT FROM d.city_id THEN RAISE EXCEPTION 'Parcela patří jinému městu'; END IF;
 IF NOT EXISTS(SELECT 1 FROM territory_district_parcels m JOIN tile_parcels q ON q.id=m.parcel_id WHERE m.district_id=d.id
   AND abs((q.grid_x*6+q.parcel_x)-(p.grid_x*6+p.parcel_x)) + abs((q.grid_y*6+q.parcel_y)-(p.grid_y*6+p.parcel_y)) = 1)
   THEN RAISE EXCEPTION 'Parcela musí sousedit s distriktem'; END IF;
 INSERT INTO territory_district_parcels(district_id, parcel_id, session_id) VALUES (d.id, p.id, p_session);
 RETURN jsonb_build_object('districtId', d.id, 'added', p.id);
END $$;

CREATE OR REPLACE FUNCTION public.rename_territory_district(p_session uuid, p_player text, p_district uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid;
BEGIN
 UPDATE territory_districts SET name=btrim(p_name) WHERE id=p_district AND session_id=p_session AND owner_player=p_player RETURNING id INTO v;
 IF v IS NULL THEN RAISE EXCEPTION 'Přejmenovat lze jen vlastní distrikt'; END IF;
 RETURN jsonb_build_object('districtId', v);
END $$;

REVOKE ALL ON FUNCTION public.district_parcel_check(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_territory_district(uuid,text,uuid,text,text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_parcel_to_district(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rename_territory_district(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.district_parcel_check(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_territory_district(uuid,text,uuid,text,text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_parcel_to_district(uuid,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rename_territory_district(uuid,text,uuid,text) TO service_role;