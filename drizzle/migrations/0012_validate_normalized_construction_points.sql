CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_turn(p_session uuid, p_player text, p_turn integer, p_patch jsonb, p_gold_delta numeric, p_capex_delta numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE current_row public.realm_resources; assignments text; capex numeric; BEGIN
  SELECT * INTO current_row FROM realm_resources WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Realm not found'; END IF;
  IF coalesce(current_row.last_processed_turn,0)>=p_turn THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn)
    OR NOT EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND coalesce(resolving_turn,current_turn)=p_turn) THEN
    RAISE EXCEPTION 'No current mandatory goods projection';
  END IF;
  SELECT coalesce(sum(coalesce((b.balance->>'construction_points')::numeric,(b.balance->>'capex')::numeric)),0) INTO capex FROM city_good_balances b JOIN cities c ON c.id=b.city_id
    WHERE b.session_id=p_session AND b.turn_number=p_turn AND c.owner_player=p_player;
  IF abs(capex-p_capex_delta)>0.011 THEN RAISE EXCEPTION 'CAPEX differs from physical ledger'; END IF;
  p_patch:=p_patch||jsonb_build_object('gold_reserve',coalesce(current_row.gold_reserve,0)+p_gold_delta,
    'production_reserve',coalesce(current_row.production_reserve,0)+p_capex_delta,'last_processed_turn',p_turn);
  SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.realm_resources,$1)).%I',k,k),',') INTO assignments
    FROM jsonb_object_keys(p_patch) k JOIN pg_attribute a ON a.attrelid='public.realm_resources'::regclass AND a.attname=k AND a.attnum>0
    WHERE k NOT IN ('id','session_id','player_name');
  EXECUTE 'UPDATE public.realm_resources SET '||assignments||' WHERE id=$2' USING p_patch,current_row.id;
  RETURN true;
END $function$;