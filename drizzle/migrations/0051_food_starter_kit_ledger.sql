CREATE TABLE public.state_import_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  realm_id uuid NOT NULL REFERENCES public.realm_resources(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  purpose text NOT NULL CHECK (purpose = 'food_starter_kit'),
  counterparty text NOT NULL DEFAULT 'foreign_traders' CHECK (counterparty = 'foreign_traders'),
  resource_key text NOT NULL,
  site_parcel_id uuid NOT NULL,
  turn_number integer NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  state_gold_before numeric NOT NULL,
  state_gold_after numeric NOT NULL CHECK (state_gold_after >= 0 AND state_gold_after = state_gold_before - amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, command_id)
);
REVOKE ALL ON public.state_import_purchases FROM anon, authenticated;
GRANT SELECT ON public.state_import_purchases TO authenticated;
GRANT ALL ON public.state_import_purchases TO service_role;
ALTER TABLE public.state_import_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read import purchases" ON public.state_import_purchases FOR SELECT TO authenticated
  USING (public.is_session_member(session_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_food_specialization_v3(p_session uuid, p_command text, p_player text, p_parcel uuid, p_key text, p_x integer, p_y integer, p_turn integer, p_mode text, p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE prev text; same boolean; realm record; done record;
BEGIN
  IF p_command IS NULL OR length(p_command) = 0 THEN RAISE EXCEPTION 'Chybí identifikátor příkazu'; END IF;
  IF p_mode NOT IN ('found','starter_kit') OR p_cost < 0 OR (p_mode = 'found' AND p_cost <> 0) OR (p_mode = 'starter_kit' AND p_cost <= 0) THEN RAISE EXCEPTION 'Neplatný zdroj osiva'; END IF;
  PERFORM 1 FROM game_sessions WHERE id = p_session FOR UPDATE;
  SELECT * INTO done FROM state_import_purchases WHERE session_id = p_session AND command_id = p_command;
  IF FOUND THEN RETURN jsonb_build_object('resource_key', done.resource_key, 'replayed', true, 'cost', done.amount); END IF;
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tile_parcels WHERE session_id = p_session AND id = p_parcel AND owner_player = p_player AND claim_kind = 'worked') THEN
    RAISE EXCEPTION 'Políčko neobdělává tvé město'; END IF;
  IF EXISTS (SELECT 1 FROM food_specializations WHERE session_id = p_session AND source_micro_x = p_x AND source_micro_y = p_y
      AND resource_key = p_key AND site_parcel_id <> p_parcel) THEN RAISE EXCEPTION 'Tento zdroj už využívá jiná stavba'; END IF;
  SELECT resource_key, (resource_key = p_key AND source_micro_x = p_x AND source_micro_y = p_y) INTO prev, same
    FROM food_specializations WHERE session_id = p_session AND site_parcel_id = p_parcel FOR UPDATE;
  IF coalesce(same, false) THEN RETURN jsonb_build_object('resource_key', p_key, 'previous', prev, 'unchanged', true); END IF;
  IF p_cost > 0 THEN
    SELECT id, gold_reserve INTO realm FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
    IF realm.id IS NULL OR realm.gold_reserve < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata na startovní osivo / chovný materiál'; END IF;
    UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE id = realm.id;
    INSERT INTO state_import_purchases (session_id, command_id, realm_id, player_name, purpose, resource_key, site_parcel_id, turn_number, amount, state_gold_before, state_gold_after)
    VALUES (p_session, p_command, realm.id, p_player, 'food_starter_kit', p_key, p_parcel, p_turn, p_cost, realm.gold_reserve, realm.gold_reserve - p_cost);
  END IF;
  INSERT INTO food_specializations (session_id, site_parcel_id, owner_player, resource_key, source_micro_x, source_micro_y, chosen_turn, stock_mode, stock_cost)
  VALUES (p_session, p_parcel, p_player, p_key, p_x, p_y, p_turn, p_mode, p_cost)
  ON CONFLICT (session_id, site_parcel_id) DO UPDATE SET owner_player = EXCLUDED.owner_player, resource_key = EXCLUDED.resource_key,
    source_micro_x = EXCLUDED.source_micro_x, source_micro_y = EXCLUDED.source_micro_y, chosen_turn = EXCLUDED.chosen_turn,
    stock_mode = EXCLUDED.stock_mode, stock_cost = EXCLUDED.stock_cost, updated_at = now();
  RETURN jsonb_build_object('resource_key', p_key, 'previous', prev, 'stock_mode', p_mode, 'cost', p_cost);
END $$;
REVOKE ALL ON FUNCTION public.set_food_specialization_v3(uuid, text, text, uuid, text, integer, integer, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_food_specialization_v3(uuid, text, text, uuid, text, integer, integer, integer, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_food_specialization_v2(uuid, text, uuid, text, integer, integer, integer, text, integer) FROM service_role;
COMMENT ON FUNCTION public.set_food_specialization_v2(uuid, text, uuid, text, integer, integer, integer, text, integer) IS 'DEPRECATED: replaced by set_food_specialization_v3 (audited, idempotent starter-kit ledger)';