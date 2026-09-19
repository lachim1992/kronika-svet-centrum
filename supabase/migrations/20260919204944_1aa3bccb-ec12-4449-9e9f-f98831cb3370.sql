-- Additive migration: no existing sessions, goods, recipes or inventories are deleted here.
ALTER TABLE public.goods ADD COLUMN IF NOT EXISTS friction_profile jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.trade_flows ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.realm_resources ADD COLUMN IF NOT EXISTS value_added_gdp numeric NOT NULL DEFAULT 0;
ALTER TABLE public.realm_resources ADD COLUMN IF NOT EXISTS economy_detail jsonb NOT NULL DEFAULT '{}';

CREATE TABLE public.economy_turn_ledgers (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed boolean NOT NULL DEFAULT false,
  committed_result jsonb,
  PRIMARY KEY(session_id,turn_number)
);
CREATE TABLE public.city_good_balances (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key),
  balance jsonb NOT NULL,
  PRIMARY KEY(session_id,turn_number,city_id,good_key)
);
CREATE TABLE public.city_economic_role_metrics (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  metrics jsonb NOT NULL,
  PRIMARY KEY(session_id,city_id)
);
CREATE TABLE public.city_hinterland_assignments (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key),
  hub_city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  PRIMARY KEY(session_id,city_id,good_key)
);
CREATE TABLE public.famous_goods (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key),
  reputation jsonb NOT NULL,
  PRIMARY KEY(session_id,city_id,good_key)
);
CREATE TABLE public.famous_good_history (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  good_key text NOT NULL REFERENCES public.goods(key),
  turn_number integer NOT NULL,
  reputation jsonb NOT NULL,
  PRIMARY KEY(session_id,city_id,good_key,turn_number)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['economy_turn_ledgers','city_good_balances','city_economic_role_metrics','city_hinterland_assignments','famous_goods','famous_good_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY session_read ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.game_players p WHERE p.session_id = %I.session_id AND p.user_id = auth.uid()))',t,t);
  END LOOP;
END $$;

-- Full solver inputs include private foreign state. Clients read only their report.
DROP POLICY session_read ON public.economy_turn_ledgers;
REVOKE ALL ON public.economy_turn_ledgers FROM anon, authenticated;

-- Player management reads never return another realm's private report or solver snapshot.
CREATE OR REPLACE FUNCTION public.read_economy_management(p_session uuid,p_player text,p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE report jsonb; BEGIN
  IF NOT EXISTS(SELECT 1 FROM game_players WHERE session_id=p_session AND user_id=auth.uid() AND player_name=p_player) THEN
    RAISE EXCEPTION 'Not a member of this realm' USING ERRCODE='42501';
  END IF;
  SELECT result->'management'->p_player INTO report FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn;
  RETURN report;
END $$;
REVOKE ALL ON FUNCTION public.read_economy_management(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_economy_management(uuid,text,integer) TO authenticated,service_role;

-- Atomic replacement of derived state. Refresh invokes this, never the commit function.
CREATE OR REPLACE FUNCTION public.replace_goods_economy_projection(p_session uuid,p_turn integer,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  -- node_inventory now means remaining physical stock, never gross recipe output.
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
END $$;
REVOKE ALL ON FUNCTION public.replace_goods_economy_projection(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_goods_economy_projection(uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_goods_economy_ledger(p_session uuid,p_turn integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ledger jsonb; row jsonb; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  SELECT result INTO ledger FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn AND NOT committed FOR UPDATE;
  IF ledger IS NULL THEN RETURN; END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(ledger->'famous') LOOP
    INSERT INTO famous_goods VALUES(p_session,(row->>'city')::uuid,row->>'good',row)
      ON CONFLICT(session_id,city_id,good_key) DO UPDATE SET reputation=EXCLUDED.reputation;
    INSERT INTO famous_good_history VALUES(p_session,(row->>'city')::uuid,row->>'good',p_turn,row) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE economy_turn_ledgers SET committed=true,committed_result=result WHERE session_id=p_session AND turn_number=p_turn;
END $$;
REVOKE ALL ON FUNCTION public.commit_goods_economy_ledger(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_goods_economy_ledger(uuid,integer) TO service_role;

-- Last-turn guard and the fiscal delta share one row lock and one transaction.
-- Concurrent player transactions are preserved by applying deltas to the locked balance.
CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_turn(p_session uuid,p_player text,p_turn integer,p_patch jsonb,p_gold_delta numeric,p_capex_delta numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.realm_resources; assignments text; capex numeric; BEGIN
  SELECT * INTO current_row FROM realm_resources WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Realm not found'; END IF;
  IF coalesce(current_row.last_processed_turn,0)>=p_turn THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn)
    OR NOT EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND current_turn=p_turn) THEN
    RAISE EXCEPTION 'No current mandatory goods projection';
  END IF;
  SELECT coalesce(sum((b.balance->>'capex')::numeric),0) INTO capex FROM city_good_balances b JOIN cities c ON c.id=b.city_id
    WHERE b.session_id=p_session AND b.turn_number=p_turn AND c.owner_player=p_player;
  IF abs(capex-p_capex_delta)>0.011 THEN RAISE EXCEPTION 'CAPEX differs from physical ledger'; END IF;
  p_patch:=p_patch||jsonb_build_object('gold_reserve',coalesce(current_row.gold_reserve,0)+p_gold_delta,
    'production_reserve',coalesce(current_row.production_reserve,0)+p_capex_delta,'last_processed_turn',p_turn);
  SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.realm_resources,$1)).%I',k,k),',') INTO assignments
    FROM jsonb_object_keys(p_patch) k JOIN pg_attribute a ON a.attrelid='public.realm_resources'::regclass AND a.attname=k AND a.attnum>0
    WHERE k NOT IN ('id','session_id','player_name');
  EXECUTE 'UPDATE public.realm_resources SET '||assignments||' WHERE id=$2' USING p_patch,current_row.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_goods_fiscal_turn(uuid,text,integer,jsonb,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_goods_fiscal_turn(uuid,text,integer,jsonb,numeric,numeric) TO service_role;

CREATE FUNCTION public.update_goods_management_reports(p_session uuid,p_turn integer,p_reports jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  UPDATE economy_turn_ledgers SET result=jsonb_set(result,'{management}',p_reports)
    WHERE session_id=p_session AND turn_number=p_turn AND NOT committed;
  IF NOT FOUND THEN RAISE EXCEPTION 'No uncommitted goods ledger'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_goods_management_reports(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_goods_management_reports(uuid,integer,jsonb) TO service_role;

DROP POLICY session_read ON public.city_good_balances;
CREATE POLICY own_realm_read ON public.city_good_balances FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM cities c JOIN game_players p ON p.session_id=c.session_id AND p.player_name=c.owner_player
  WHERE c.id=city_id AND c.session_id=city_good_balances.session_id AND p.user_id=auth.uid()));

-- Complete legacy processing recipes only when their input catalog exists.
UPDATE production_recipes SET input_items='[{"key":"timber","qty":2}]'::jsonb
WHERE recipe_key='burn_charcoal' AND input_items='[]'::jsonb AND EXISTS(SELECT 1 FROM goods WHERE key='timber');
UPDATE production_recipes SET input_items='[{"key":"raw_hide","qty":1}]'::jsonb
WHERE recipe_key='scribe_documents' AND input_items='[]'::jsonb AND EXISTS(SELECT 1 FROM goods WHERE key='raw_hide');
UPDATE production_recipes SET input_items='[{"key":"timber","qty":2}]'::jsonb
WHERE recipe_key='build_granary' AND input_items='[]'::jsonb AND EXISTS(SELECT 1 FROM goods WHERE key='timber');