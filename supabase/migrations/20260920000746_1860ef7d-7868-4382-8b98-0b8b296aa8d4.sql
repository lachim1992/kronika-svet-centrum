CREATE OR REPLACE FUNCTION public.replace_goods_economy_projection(p_session uuid, p_turn integer, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE row jsonb; rec public.realm_resources; node uuid; projection_time timestamptz; projection_index integer:=0; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  IF NOT EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND current_turn=p_turn) THEN
    RAISE EXCEPTION 'Economy projection has a stale turn';
  END IF;
  INSERT INTO economy_turn_ledgers(session_id,turn_number,result) VALUES(p_session,p_turn,p_payload->'result')
    ON CONFLICT(session_id,turn_number) DO UPDATE SET result=EXCLUDED.result;
  SELECT created_at INTO projection_time FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn;
  DELETE FROM city_good_balances WHERE session_id=p_session AND turn_number=p_turn;
  INSERT INTO city_good_balances SELECT p_session,p_turn,(b->>'city')::uuid,b->>'good',b FROM jsonb_array_elements(p_payload->'result'->'balances') b;
  DELETE FROM city_economic_role_metrics WHERE session_id=p_session;
  INSERT INTO city_economic_role_metrics SELECT p_session,(b->>'city')::uuid,p_turn,b FROM jsonb_array_elements(p_payload->'result'->'metrics') b;
  DELETE FROM city_hinterland_assignments WHERE session_id=p_session;
  INSERT INTO city_hinterland_assignments SELECT p_session,(b->>'city')::uuid,b->>'good',(b->>'hub')::uuid FROM jsonb_array_elements(p_payload->'result'->'hinterlands') b;
  DELETE FROM city_market_baskets WHERE session_id=p_session AND turn_number=p_turn;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'marketBaskets') LOOP
    projection_index:=projection_index+1;
    INSERT INTO city_market_baskets SELECT (jsonb_populate_record(NULL::city_market_baskets,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid)||row)).*;
  END LOOP;
  -- demand_baskets is a compatibility projection of the canonical basket ledger (single source of truth).
  DELETE FROM demand_baskets WHERE session_id=p_session;
  FOR row IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'demandBaskets','[]'::jsonb)) LOOP
    projection_index:=projection_index+1;
    INSERT INTO demand_baskets SELECT (jsonb_populate_record(NULL::demand_baskets,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid)||row)).*;
  END LOOP;
  DELETE FROM trade_flows WHERE session_id=p_session;
  DELETE FROM city_market_summary WHERE session_id=p_session AND turn_number=p_turn;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'summaries') LOOP
    projection_index:=projection_index+1;
    INSERT INTO city_market_summary SELECT (jsonb_populate_record(NULL::city_market_summary,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid)||row)).*;
  END LOOP;
  DELETE FROM market_shares WHERE session_id=p_session AND turn_number=p_turn;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'marketShares') LOOP
    projection_index:=projection_index+1;
    INSERT INTO market_shares SELECT (jsonb_populate_record(NULL::market_shares,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid,'created_at',projection_time)||row)).*;
  END LOOP;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'tradeFlows') LOOP
    projection_index:=projection_index+1;
    INSERT INTO trade_flows SELECT (jsonb_populate_record(NULL::trade_flows,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid,'created_at',projection_time,'price_band',0,'trade_pressure',0,'friction_score',0,'maturity',0)||row)).*;
  END LOOP;
  DELETE FROM basket_trade_flows WHERE session_id=p_session AND turn_number=p_turn;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'basketFlows') LOOP
    projection_index:=projection_index+1;
    INSERT INTO basket_trade_flows SELECT (jsonb_populate_record(NULL::basket_trade_flows,jsonb_build_object('id',md5(p_session::text||p_turn::text||row::text||projection_index::text)::uuid,'created_at',projection_time,'tariff_factor',1,'access_level',1)||row)).*;
  END LOOP;
  DELETE FROM node_inventory WHERE node_id IN (SELECT id FROM province_nodes WHERE session_id=p_session);
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'result'->'balances') LOOP
    SELECT id INTO node FROM province_nodes WHERE session_id=p_session AND city_id=(row->>'city')::uuid ORDER BY id LIMIT 1;
    IF node IS NOT NULL AND (row->>'stored')::numeric>0 THEN
      INSERT INTO node_inventory(id,node_id,good_key,quantity,quality_band) VALUES(md5(node::text||(row->>'good'))::uuid,node,row->>'good',(row->>'stored')::numeric,floor((row->>'quality')::numeric));
    END IF;
  END LOOP;
  FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'realms') LOOP
    UPDATE realm_resources SET
      goods_production_value=(row->>'goods_production_value')::numeric,
      value_added_gdp=(row->>'value_added_gdp')::numeric,
      goods_extraction_value=(row->>'goods_extraction_value')::numeric,
      goods_domestic_consumption_value=(row->>'goods_domestic_consumption_value')::numeric,
      construction_available_for_capex=(row->>'construction_available_for_capex')::numeric,
      goods_supply_volume=(row->>'goods_supply_volume')::numeric,
      goods_value_detail=row->'goods_value_detail',economy_detail=row->'economy_detail'
      WHERE session_id=p_session AND player_name=row->>'player_name';
  END LOOP;
END $function$;