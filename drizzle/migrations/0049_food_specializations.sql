CREATE TABLE public.food_specializations (
  session_id uuid NOT NULL,
  site_parcel_id uuid NOT NULL,
  owner_player text NOT NULL,
  resource_key text NOT NULL,
  source_micro_x integer NOT NULL,
  source_micro_y integer NOT NULL,
  chosen_turn integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, site_parcel_id),
  UNIQUE (session_id, source_micro_x, source_micro_y, resource_key)
);
GRANT SELECT ON public.food_specializations TO authenticated;
GRANT ALL ON public.food_specializations TO service_role;
ALTER TABLE public.food_specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read food specializations" ON public.food_specializations FOR SELECT TO authenticated
  USING (app_private.is_session_member(session_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_food_specialization(p_session uuid, p_player text, p_parcel uuid, p_key text, p_x integer, p_y integer, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE prev text;
BEGIN
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tile_parcels WHERE session_id = p_session AND id = p_parcel AND owner_player = p_player AND claim_kind = 'worked') THEN
    RAISE EXCEPTION 'Políčko neobdělává tvé město'; END IF;
  IF EXISTS (SELECT 1 FROM food_specializations WHERE session_id = p_session AND source_micro_x = p_x AND source_micro_y = p_y
      AND resource_key = p_key AND site_parcel_id <> p_parcel) THEN RAISE EXCEPTION 'Tento zdroj už využívá jiná stavba'; END IF;
  SELECT resource_key INTO prev FROM food_specializations WHERE session_id = p_session AND site_parcel_id = p_parcel FOR UPDATE;
  INSERT INTO food_specializations (session_id, site_parcel_id, owner_player, resource_key, source_micro_x, source_micro_y, chosen_turn)
  VALUES (p_session, p_parcel, p_player, p_key, p_x, p_y, p_turn)
  ON CONFLICT (session_id, site_parcel_id) DO UPDATE SET owner_player = EXCLUDED.owner_player, resource_key = EXCLUDED.resource_key,
    source_micro_x = EXCLUDED.source_micro_x, source_micro_y = EXCLUDED.source_micro_y,
    chosen_turn = CASE WHEN food_specializations.resource_key = EXCLUDED.resource_key AND food_specializations.source_micro_x = EXCLUDED.source_micro_x
      AND food_specializations.source_micro_y = EXCLUDED.source_micro_y THEN food_specializations.chosen_turn ELSE EXCLUDED.chosen_turn END,
    updated_at = now();
  RETURN jsonb_build_object('resource_key', p_key, 'previous', prev);
END $$;
REVOKE ALL ON FUNCTION public.set_food_specialization(uuid, text, uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_food_specialization(uuid, text, uuid, text, integer, integer, integer) TO service_role;