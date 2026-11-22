-- Deterministic neutral-neutral relations: actual physical trade and territorial competition.
-- No LLM, no fake trade volume, no unsolicited pact with a human player, no treasury writes.
CREATE TABLE IF NOT EXISTS public.neutral_city_relations(
 session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
 faction_a text NOT NULL,
 faction_b text NOT NULL,
 last_decision_turn integer NOT NULL,
 trust numeric NOT NULL DEFAULT 0,
 rivalry numeric NOT NULL DEFAULT 0,
 observed_trade numeric NOT NULL DEFAULT 0,
 disposition text NOT NULL CHECK(disposition IN ('cooperative','neutral','competitive')),
 rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(session_id,faction_a,faction_b),
 CHECK(faction_a < faction_b)
);
REVOKE ALL ON public.neutral_city_relations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.neutral_city_relations TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_neutral_city_diplomacy(p_session uuid,p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $autonomy$
DECLARE pair record; v_volume numeric; v_prior public.neutral_city_relations%ROWTYPE;
 v_trust numeric;v_rivalry numeric; v_dist integer;v_pacts integer:=0;v_updated integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND current_turn=p_turn
  AND (resolving_turn IS NULL OR resolving_turn=p_turn+1))
 THEN RAISE EXCEPTION 'Neutral diplomacy: stale turn';END IF;
 FOR pair IN
  SELECT a.owner_player faction_a,b.owner_player faction_b,
    a.grid_x ax,a.grid_y ay,b.grid_x bx,b.grid_y by
  FROM cities a JOIN cities b ON b.session_id=a.session_id AND a.owner_player<b.owner_player
  WHERE a.session_id=p_session AND a.owner_player LIKE 'Neutral:%'
    AND b.owner_player LIKE 'Neutral:%' AND a.status='ok' AND b.status='ok'
  ORDER BY a.owner_player,b.owner_player
 LOOP
  SELECT * INTO v_prior FROM neutral_city_relations
    WHERE session_id=p_session AND faction_a=pair.faction_a AND faction_b=pair.faction_b;
  IF FOUND AND v_prior.last_decision_turn>=p_turn THEN CONTINUE;END IF;
  SELECT coalesce(sum(tf.volume_per_turn),0) INTO v_volume FROM trade_flows tf
    WHERE tf.session_id=p_session AND tf.status='active'
      AND ((tf.source_player=pair.faction_a AND tf.target_player=pair.faction_b)
       OR (tf.source_player=pair.faction_b AND tf.target_player=pair.faction_a));
  v_dist:=abs(pair.ax-pair.bx)+abs(pair.ay-pair.by);
  -- Relationship growth requires proven goods transfer; proximity gives competition
  -- for land but does NOT invent hostility or battle events.
  v_trust:=greatest(-100,least(100,coalesce(v_prior.trust,0)+least(5,v_volume*10)
    -CASE WHEN v_dist<=2 THEN 0.2 ELSE 0 END));
  v_rivalry:=greatest(0,least(100,coalesce(v_prior.rivalry,0)+
    CASE WHEN v_dist<=2 THEN 0.5 WHEN v_dist<=4 THEN 0.1 ELSE -0.2 END));
  INSERT INTO neutral_city_relations(session_id,faction_a,faction_b,last_decision_turn,
    trust,rivalry,observed_trade,disposition,rationale)
  VALUES(p_session,pair.faction_a,pair.faction_b,p_turn,
    v_trust,v_rivalry,v_volume,CASE WHEN v_trust>=2 AND v_volume>=0.025 THEN 'cooperative'
      WHEN v_rivalry>=8 THEN 'competitive' ELSE 'neutral' END,
    jsonb_build_object('distance_macro',v_dist,'recorded_trade_volume',v_volume,
      'decision_source','active_actual_goods_flows','model_calls',0))
  ON CONFLICT(session_id,faction_a,faction_b) DO UPDATE SET
    last_decision_turn=excluded.last_decision_turn,trust=excluded.trust,
    rivalry=excluded.rivalry,observed_trade=excluded.observed_trade,
    disposition=excluded.disposition,rationale=excluded.rationale;
  v_updated:=v_updated+1;
  -- Open borders are a supported canonical diplomatic pact: movement becomes legal
  -- while recorded goods trading precedes the diplomatic benefit (never reverse).
  IF v_trust>=2 AND v_volume>=0.025
     AND NOT EXISTS(SELECT 1 FROM war_declarations w WHERE w.session_id=p_session
       AND w.status='active'
       AND ((w.declaring_player=pair.faction_a AND w.target_player=pair.faction_b)
        OR (w.declaring_player=pair.faction_b AND w.target_player=pair.faction_a)))
     AND NOT EXISTS(SELECT 1 FROM diplomatic_pacts dp WHERE dp.session_id=p_session
       AND dp.pact_type='open_borders' AND dp.status='active'
       AND ((dp.party_a=pair.faction_a AND dp.party_b=pair.faction_b)
        OR (dp.party_b=pair.faction_a AND dp.party_a=pair.faction_b)))
  THEN
   INSERT INTO diplomatic_pacts(session_id,party_a,party_b,pact_type,effects,status,
     proposed_by,proposed_turn,accepted_turn,expires_turn,proclamation_text)
   VALUES(p_session,pair.faction_a,pair.faction_b,'open_borders',
     jsonb_build_object('non_aggression','trade_led','origin','neutral_rules_v1'),
     'active',pair.faction_a,p_turn,p_turn,p_turn+12,
     'Neutrální města umožňují vzájemný průchod na základě již uskutečněného obchodu.');
   v_pacts:=v_pacts+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'pairs_changed',v_updated,'open_borders_formed',v_pacts,
  'physical_trade_source',true,'no_money_created',true,'war_actions',0);
END
$autonomy$;
REVOKE ALL ON FUNCTION public.resolve_neutral_city_diplomacy(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_neutral_city_diplomacy(uuid,integer) TO service_role;

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
  BEGIN PERFORM resolve_neutral_city_diplomacy(NEW.id,NEW.current_turn);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Neutral diplomatic relation error: %',SQLERRM; END;
 END IF;
 RETURN NEW;
END $trigger$;
