-- Existing game_events.command_id requires UUID; use stable RFC-shaped UUID strings for
-- retries across turn service invocations. No money, parcel or production state changes.
UPDATE public.neutral_city_investment_plans p SET
  command_id_claim=md5(p.session_id::text||':'||p.turn_number::text||':'||p.city_id::text||':claim')::uuid::text,
  command_id_build=md5(p.session_id::text||':'||p.turn_number::text||':'||p.city_id::text||':build')::uuid::text,
  updated_at=now()
WHERE p.status IN ('ready','saving','executing')
  AND (p.command_id_claim IS NULL OR p.command_id_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

CREATE OR REPLACE FUNCTION public.plan_neutral_city_investments(p_session uuid,p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  g public.game_sessions%ROWTYPE;
  c record; t record; p record; rr record;
  v_hold integer;v_existing integer;v_gold numeric;v_prod numeric;v_status text;
  v_ready integer:=0;v_saving integer:=0;v_skipped integer:=0;
BEGIN
  SELECT * INTO g FROM public.game_sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND OR g.current_turn<>p_turn
     OR (g.resolving_turn IS NOT NULL AND g.resolving_turn<>p_turn+1)
  THEN RAISE EXCEPTION 'Neutral investment plans require current turn'; END IF;
  SELECT * INTO t FROM public.building_templates WHERE name='Studna' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Water investment template missing'; END IF;
  FOR c IN SELECT id,name,owner_player,grid_x,grid_y
    FROM public.cities WHERE session_id=p_session AND status='ok'
    AND owner_player LIKE 'Neutral:%' ORDER BY name
  LOOP
    -- No duplicate or escalating well spam while the first build is in progress.
    SELECT count(*) INTO v_existing FROM public.city_buildings b
      WHERE b.city_id=c.id AND b.template_id=t.id AND b.status IN ('building','completed');
    IF v_existing>0 THEN v_skipped:=v_skipped+1;CONTINUE;END IF;
    IF EXISTS(SELECT 1 FROM public.neutral_city_investment_plans n
      WHERE n.session_id=p_session AND n.turn_number=p_turn AND n.city_id=c.id)
    THEN v_skipped:=v_skipped+1;CONTINUE;END IF;

    SELECT count(*) INTO v_hold FROM public.tile_parcels
       WHERE session_id=p_session AND city_id=c.id AND status IN ('occupied','claimed');
    -- Prefer already-paid urban parcels with spare physical slots.
    SELECT tp.id,tp.build_cost_multiplier,false AS requires_claim
      INTO p FROM public.tile_parcels tp
      WHERE tp.session_id=p_session AND tp.city_id=c.id
        AND tp.claim_kind='urban' AND tp.status='claimed' AND tp.buildable
        AND NOT EXISTS(SELECT 1 FROM public.tile_parcel_contents pc WHERE pc.parcel_id=tp.id)
      ORDER BY tp.build_cost_multiplier,tp.parcel_index LIMIT 1;
    IF NOT FOUND THEN
      SELECT tp.id,tp.build_cost_multiplier,true AS requires_claim
      INTO p FROM public.tile_parcels tp
      WHERE tp.session_id=p_session AND tp.grid_x=c.grid_x AND tp.grid_y=c.grid_y
        AND tp.buildable AND tp.status='wild' AND tp.city_id IS NULL AND tp.owner_player IS NULL
      ORDER BY tp.build_cost_multiplier,tp.parcel_index LIMIT 1;
    END IF;
    IF NOT FOUND THEN v_skipped:=v_skipped+1; CONTINUE;END IF;

    SELECT gold_reserve,production_reserve INTO rr FROM public.realm_resources
      WHERE session_id=p_session AND player_name=c.owner_player;
    IF NOT FOUND THEN v_skipped:=v_skipped+1; CONTINUE;END IF;
    -- Exact undiscounted quote is a conservative estimate, not the payment.
    -- claim cost mirrors tileParcels.parcelClaimCost. The canonical command makes
    -- the FINAL authoritative price and debt check, applying any policy discounts.
    v_gold:=coalesce(t.cost_wealth,0)
      + CASE WHEN p.requires_claim THEN round(35*p.build_cost_multiplier*(1+v_hold*0.04)) ELSE 0 END;
    v_prod:=coalesce(t.cost_wood,0)+coalesce(t.cost_stone,0)+coalesce(t.cost_iron,0)
      + CASE WHEN p.requires_claim THEN round(25*p.build_cost_multiplier*(1+v_hold*0.04)) ELSE 0 END;
    v_status:=CASE WHEN rr.gold_reserve>=v_gold+10 AND rr.production_reserve>=v_prod+5
      THEN 'ready' ELSE 'saving' END;
    INSERT INTO public.neutral_city_investment_plans
       (session_id,turn_number,city_id,owner_player,action,template_id,parcel_id,
        requires_claim,quote_gold,quote_production,status,reason,command_id_claim,command_id_build)
    VALUES (p_session,p_turn,c.id,c.owner_player,'build_well',t.id,p.id,
        p.requires_claim,v_gold,v_prod,v_status,
        jsonb_build_object('goal','secure drinking water','current_gold',rr.gold_reserve,
          'current_production',rr.production_reserve,'housing_city',c.name,
          'decision','last_committed_data_only','price_is_estimate',true,'no_resources_spent',true),
        md5(p_session::text||':'||p_turn::text||':'||c.id::text||':claim')::uuid::text,
        md5(p_session::text||':'||p_turn::text||':'||c.id::text||':build')::uuid::text);
    IF v_status='ready' THEN v_ready:=v_ready+1;ELSE v_saving:=v_saving+1;END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'turn',p_turn,'ready',v_ready,'saving',v_saving,
    'skipped',v_skipped,'committed_payments',0);
END
$fn$;
REVOKE ALL ON FUNCTION public.plan_neutral_city_investments(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.plan_neutral_city_investments(uuid,integer) TO service_role;
