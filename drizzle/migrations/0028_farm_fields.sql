CREATE TABLE public.farm_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  farm_parcel_id uuid NOT NULL,
  field_parcel_id uuid NOT NULL,
  owner_player text NOT NULL,
  created_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, field_parcel_id)
);
CREATE INDEX farm_fields_farm_idx ON public.farm_fields (session_id, farm_parcel_id);
GRANT SELECT ON public.farm_fields TO authenticated;
GRANT ALL ON public.farm_fields TO service_role;
ALTER TABLE public.farm_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read farm fields" ON public.farm_fields FOR SELECT TO authenticated
  USING (app_private.is_session_member(session_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.add_farm_field(p_session uuid, p_player text, p_farm uuid, p_field uuid, p_cost integer, p_max integer, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g numeric; n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('farm_fields:' || p_farm::text));
  SELECT count(*) INTO n FROM farm_fields WHERE session_id = p_session AND farm_parcel_id = p_farm;
  IF n >= p_max THEN RAISE EXCEPTION 'Farma už má % polí', p_max; END IF;
  IF EXISTS (SELECT 1 FROM farm_fields WHERE session_id = p_session AND (field_parcel_id = p_field OR farm_parcel_id = p_field)) THEN RAISE EXCEPTION 'Políčko už je polem'; END IF;
  IF EXISTS (SELECT 1 FROM city_buildings WHERE parcel_id = p_field) THEN RAISE EXCEPTION 'Na políčku stojí stavba'; END IF;
  SELECT gold_reserve INTO g FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
  IF g IS NULL OR g < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', p_cost, coalesce(g, 0); END IF;
  UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id = p_session AND player_name = p_player;
  INSERT INTO farm_fields (session_id, farm_parcel_id, field_parcel_id, owner_player, created_turn) VALUES (p_session, p_farm, p_field, p_player, p_turn);
  RETURN jsonb_build_object('cost', p_cost, 'fields', n + 1);
END $$;
REVOKE ALL ON FUNCTION public.add_farm_field(uuid, text, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_farm_field(uuid, text, uuid, uuid, integer, integer, integer) TO service_role;