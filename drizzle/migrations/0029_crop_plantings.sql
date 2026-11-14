CREATE TABLE public.crop_plantings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  owner_player text NOT NULL,
  parcel_id uuid NOT NULL,
  micro_x integer NOT NULL,
  micro_y integer NOT NULL,
  kind text NOT NULL,
  planted_turn integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, micro_x, micro_y, kind)
);
GRANT SELECT ON public.crop_plantings TO authenticated;
GRANT ALL ON public.crop_plantings TO service_role;
ALTER TABLE public.crop_plantings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read crop plantings" ON public.crop_plantings FOR SELECT TO authenticated
  USING (app_private.is_session_member(session_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.plant_crop(p_session uuid, p_player text, p_parcel uuid, p_x integer, p_y integer, p_kind text, p_cost integer, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF EXISTS (SELECT 1 FROM crop_plantings WHERE session_id = p_session AND micro_x = p_x AND micro_y = p_y AND kind = p_kind) THEN RAISE EXCEPTION 'Tady už je vysazeno'; END IF;
  SELECT gold_reserve INTO g FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
  IF g IS NULL OR g < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', p_cost, coalesce(g, 0); END IF;
  UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id = p_session AND player_name = p_player;
  INSERT INTO crop_plantings (session_id, owner_player, parcel_id, micro_x, micro_y, kind, planted_turn) VALUES (p_session, p_player, p_parcel, p_x, p_y, p_kind, p_turn);
  RETURN jsonb_build_object('cost', p_cost, 'mature_turn', p_turn + 3);
END $$;
REVOKE ALL ON FUNCTION public.plant_crop(uuid, text, uuid, integer, integer, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plant_crop(uuid, text, uuid, integer, integer, text, integer, integer) TO service_role;