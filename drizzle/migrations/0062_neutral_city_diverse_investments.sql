-- Multi-type funded municipal choices, never directly writes accounts or assets.
ALTER TABLE public.neutral_city_investment_plans DROP CONSTRAINT IF EXISTS neutral_city_investment_plans_action_check;
ALTER TABLE public.neutral_city_investment_plans ADD CONSTRAINT neutral_city_investment_plans_action_check CHECK (action IN ('build_well','build_structure'));
CREATE OR REPLACE FUNCTION public.plan_neutral_city_investments(p_session uuid,p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  g public.game_sessions%ROWTYPE;
  c record; t record; p record; rr record;
  v_action text; v_preferred text; v_water numeric; v_food numeric; v_fuel numeric; v_current integer;
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
    SELECT count(*) INTO v_current FROM public.city_buildings b
       JOIN public.building_templates bt ON bt.id=b.template_id
       WHERE b.city_id=c.id AND bt.name='Studna' AND b.status IN ('building','completed');
    v_action:=CASE WHEN v_current=0 THEN 'build_well' ELSE 'build_structure' END;
    IF v_action='build_structure' THEN
      SELECT coalesce(max(unmet_demand) FILTER(WHERE basket_key='staple_food'),0),
             coalesce(max(unmet_demand) FILTER(WHERE basket_key='drinking_water'),0),
             coalesce(max(unmet_demand) FILTER(WHERE basket_key='fuel'),0)
      INTO v_food,v_water,v_fuel
      FROM public.city_market_baskets b
      WHERE b.session_id=p_session AND b.city_id=c.id
        AND b.turn_number=(SELECT max(l.turn_number) FROM public.economy_turn_ledgers l
           WHERE l.session_id=p_session AND l.committed AND l.turn_number<=p_turn);
      v_preferred:=CASE WHEN v_food>0.5 THEN 'Sýpka'
         WHEN v_fuel>0.2 THEN 'Uhlířství'
         WHEN EXISTS(SELECT 1 FROM public.province_hexes h
            WHERE h.session_id=p_session AND h.grid_x=c.grid_x AND h.grid_y=c.grid_y
              AND h.biome_family LIKE '%forest%') THEN 'Pila'
         ELSE 'Sýpka' END;
      SELECT count(*) INTO v_current FROM public.city_buildings b
         JOIN public.building_templates bt ON bt.id=b.template_id
         WHERE b.city_id=c.id AND bt.name=v_preferred AND b.status IN ('building','completed');
      IF v_current>0 THEN v_preferred:=CASE WHEN v_preferred='Sýpka' THEN 'Uhlířství' ELSE 'Sýpka' END; END IF;
      SELECT * INTO t FROM public.building_templates WHERE name=v_preferred AND required_settlement_level='HAMLET' LIMIT 1;
      IF NOT FOUND THEN v_skipped:=v_skipped+1;CONTINUE;END IF;
      SELECT count(*) INTO v_current FROM public.city_buildings b
         WHERE b.city_id=c.id AND b.template_id=t.id AND b.status IN ('building','completed');
      IF v_current>0 THEN v_skipped:=v_skipped+1;CONTINUE;END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM public.neutral_city_investment_plans n
      WHERE n.session_id=p_session AND n.turn_number=p_turn AND n.city_id=c.id AND n.action=v_action)
    THEN v_skipped:=v_skipped+1;CONTINUE;END IF;

    SELECT count(*) INTO v_hold FROM public.tile_parcels
       WHERE session_id=p_session AND city_id=c.id AND status IN ('occupied','claimed');
    -- A paid urban plot has several physical slots (typically 3).
    -- Reuse a non-civic industrial plot if at least one real slot remains,
    -- even when another building has already set status='occupied'.
    SELECT tp.id,tp.build_cost_multiplier,false AS requires_claim
      INTO p FROM public.tile_parcels tp
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(pc.slots_used),0) AS used
          FROM public.tile_parcel_contents pc WHERE pc.parcel_id=tp.id
      ) occupancy ON true
      WHERE tp.session_id=p_session AND tp.city_id=c.id
        AND tp.claim_kind='urban' AND tp.status IN ('claimed','occupied')
        AND tp.land_use NOT IN ('civic','residential')
        AND tp.buildable AND occupancy.used<tp.capacity_slots
      ORDER BY CASE WHEN tp.status='claimed' THEN 0 ELSE 1 END,
        occupancy.used,tp.build_cost_multiplier,tp.parcel_index LIMIT 1;
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
    VALUES (p_session,p_turn,c.id,c.owner_player,v_action,t.id,p.id,
        p.requires_claim,v_gold,v_prod,v_status,
        jsonb_build_object('goal',CASE WHEN v_action='build_well' THEN 'secure drinking water' ELSE 'respond to committed need shortages' END,'chosen_template',t.name,'current_gold',rr.gold_reserve,
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
