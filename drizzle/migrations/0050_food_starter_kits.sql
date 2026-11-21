ALTER TABLE public.food_specializations ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'found';
ALTER TABLE public.food_specializations ADD COLUMN IF NOT EXISTS stock_cost integer NOT NULL DEFAULT 0;
ALTER TABLE public.food_specializations ADD CONSTRAINT food_specializations_stock_mode_chk CHECK (stock_mode IN ('found','starter_kit') AND stock_cost >= 0);

CREATE OR REPLACE FUNCTION public.set_food_specialization_v2(p_session uuid, p_player text, p_parcel uuid, p_key text, p_x integer, p_y integer, p_turn integer, p_mode text, p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE prev text; same boolean; gold numeric;
BEGIN
  IF p_mode NOT IN ('found','starter_kit') OR p_cost < 0 OR (p_mode = 'found' AND p_cost <> 0) OR (p_mode = 'starter_kit' AND p_cost <= 0) THEN RAISE EXCEPTION 'Neplatný zdroj osiva'; END IF;
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tile_parcels WHERE session_id = p_session AND id = p_parcel AND owner_player = p_player AND claim_kind = 'worked') THEN
    RAISE EXCEPTION 'Políčko neobdělává tvé město'; END IF;
  IF EXISTS (SELECT 1 FROM food_specializations WHERE session_id = p_session AND source_micro_x = p_x AND source_micro_y = p_y
      AND resource_key = p_key AND site_parcel_id <> p_parcel) THEN RAISE EXCEPTION 'Tento zdroj už využívá jiná stavba'; END IF;
  SELECT resource_key, (resource_key = p_key AND source_micro_x = p_x AND source_micro_y = p_y) INTO prev, same
    FROM food_specializations WHERE session_id = p_session AND site_parcel_id = p_parcel FOR UPDATE;
  IF coalesce(same, false) THEN RETURN jsonb_build_object('resource_key', p_key, 'previous', prev, 'unchanged', true); END IF;
  IF p_cost > 0 THEN
    SELECT gold_reserve INTO gold FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
    IF gold IS NULL OR gold < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata na startovní osivo / chovný materiál'; END IF;
    UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id = p_session AND player_name = p_player;
  END IF;
  INSERT INTO food_specializations (session_id, site_parcel_id, owner_player, resource_key, source_micro_x, source_micro_y, chosen_turn, stock_mode, stock_cost)
  VALUES (p_session, p_parcel, p_player, p_key, p_x, p_y, p_turn, p_mode, p_cost)
  ON CONFLICT (session_id, site_parcel_id) DO UPDATE SET owner_player = EXCLUDED.owner_player, resource_key = EXCLUDED.resource_key,
    source_micro_x = EXCLUDED.source_micro_x, source_micro_y = EXCLUDED.source_micro_y, chosen_turn = EXCLUDED.chosen_turn,
    stock_mode = EXCLUDED.stock_mode, stock_cost = EXCLUDED.stock_cost, updated_at = now();
  RETURN jsonb_build_object('resource_key', p_key, 'previous', prev, 'stock_mode', p_mode, 'cost', p_cost);
END $$;
REVOKE ALL ON FUNCTION public.set_food_specialization_v2(uuid, text, uuid, text, integer, integer, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_food_specialization_v2(uuid, text, uuid, text, integer, integer, integer, text, integer) TO service_role;