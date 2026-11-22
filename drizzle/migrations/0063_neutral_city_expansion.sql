
-- Verified physical expansion intentions; only command-dispatch can survey/claim land.
CREATE TABLE IF NOT EXISTS public.neutral_city_expansion_plans (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
 turn_number integer NOT NULL CHECK(turn_number>0),
 city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
 owner_player text NOT NULL,
 grid_x integer NOT NULL,
 grid_y integer NOT NULL,
 status text NOT NULL CHECK(status IN ('ready','saving','executing','completed','refused')),
 quote_gold numeric NOT NULL CHECK(quote_gold>=0),
 command_id_survey uuid NOT NULL,
 command_id_claim uuid NOT NULL,
 reason jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,turn_number,city_id),
 UNIQUE(session_id,turn_number,grid_x,grid_y)
);
REVOKE ALL ON public.neutral_city_expansion_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.neutral_city_expansion_plans TO service_role;

CREATE OR REPLACE FUNCTION public.plan_neutral_city_expansion(p_session uuid,p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE c record; candidate record; v_cost integer;v_gold numeric;v_created integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND current_turn=p_turn
    AND (resolving_turn IS NULL OR resolving_turn=p_turn+1))
 THEN RAISE EXCEPTION 'Neutral expansion: stale turn';END IF;
 -- Territorial development is deliberately slow: max 3 competing proposals per turn.
 FOR c IN SELECT id,name,owner_player,grid_x,grid_y
  FROM public.cities
  WHERE session_id=p_session AND owner_player LIKE 'Neutral:%' AND status='ok'
  ORDER BY md5(p_turn::text||':'||id::text)
 LOOP
  EXIT WHEN v_created>=3;
  IF EXISTS(SELECT 1 FROM public.neutral_city_expansion_plans n WHERE n.session_id=p_session
     AND n.city_id=c.id AND n.status IN ('ready','saving','executing','completed')
     AND n.turn_number>=p_turn-5)
  THEN CONTINUE;END IF;
  -- One province per founded city in the current seed. No crossing other owners' frontier.
  SELECT h.grid_x,h.grid_y,h.biome_family,h.has_river,h.forest_density
   INTO candidate
   FROM public.province_hexes h
   JOIN public.province_hexes own ON own.session_id=h.session_id
     AND own.owner_player=c.owner_player
     AND abs(own.grid_x-h.grid_x)+abs(own.grid_y-h.grid_y)=1
   WHERE h.session_id=p_session AND h.owner_player IS NULL AND h.is_passable=true
     AND h.biome_family !~ '(sea|ocean|lake|water)'
     AND abs(h.grid_x-c.grid_x)+abs(h.grid_y-c.grid_y)<=3
     AND NOT EXISTS(SELECT 1 FROM public.neutral_city_expansion_plans n
        WHERE n.session_id=p_session AND n.turn_number=p_turn
        AND n.grid_x=h.grid_x AND n.grid_y=h.grid_y)
   ORDER BY (CASE WHEN h.has_river THEN 3 ELSE 0 END)
    +(CASE WHEN h.biome_family IN ('hills','forest','plains') THEN 2 ELSE 0 END)
    +coalesce(h.forest_density,0)/50.0 DESC,h.grid_x,h.grid_y LIMIT 1;
  IF NOT FOUND THEN CONTINUE;END IF;
  SELECT coalesce(gold_reserve,0) INTO v_gold FROM realm_resources WHERE
    session_id=p_session AND player_name=c.owner_player;
  IF NOT FOUND THEN CONTINUE;END IF;
  SELECT 25+(count(*)::integer/5)*5 INTO v_cost FROM province_hexes
    WHERE session_id=p_session AND owner_player=c.owner_player;
  -- survey level 1 costs five; claim uses canonical escalating cost; keep 40 in treasury.
  INSERT INTO public.neutral_city_expansion_plans(session_id,turn_number,city_id,owner_player,
    grid_x,grid_y,status,quote_gold,command_id_survey,command_id_claim,reason)
  VALUES(p_session,p_turn,c.id,c.owner_player,candidate.grid_x,candidate.grid_y,
    CASE WHEN v_gold>=v_cost+45 THEN 'ready' ELSE 'saving' END,v_cost+5,
    md5(p_session::text||':'||p_turn::text||':'||c.id::text||':survey_macro')::uuid,
    md5(p_session::text||':'||p_turn::text||':'||c.id::text||':claim_macro')::uuid,
    jsonb_build_object('biome',candidate.biome_family,'river',candidate.has_river,
     'gold_budget',v_gold,'claim_price_estimate',v_cost,'requires_paid_survey',true,
     'physical_expansion_only',true));
  v_created:=v_created+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'turn',p_turn,'plans',v_created,
  'funded_only',true,'no_cash_change',true);
END
$fn$;
REVOKE ALL ON FUNCTION public.plan_neutral_city_expansion(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.plan_neutral_city_expansion(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.plan_neutral_city_at_turn_begin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $trigger$
BEGIN
 IF NEW.resolving_turn IS NOT NULL AND OLD.resolving_turn IS DISTINCT FROM NEW.resolving_turn
  AND NEW.resolving_turn=NEW.current_turn+1
  AND EXISTS(SELECT 1 FROM cities c WHERE c.session_id=NEW.id AND c.owner_player LIKE 'Neutral:%')
 THEN
  BEGIN PERFORM plan_neutral_city_production(NEW.id,NEW.current_turn);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Neutral production plan error: %',SQLERRM; END;
  BEGIN PERFORM plan_neutral_city_investments(NEW.id,NEW.current_turn);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Neutral investment plan error: %',SQLERRM; END;
  BEGIN PERFORM plan_neutral_city_expansion(NEW.id,NEW.current_turn);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Neutral expansion plan error: %',SQLERRM; END;
 END IF;
 RETURN NEW;
END $trigger$;
