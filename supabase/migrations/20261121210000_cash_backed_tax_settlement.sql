-- Cash-backed fiscal settlement. Legacy games (private_cash_version=0) are untouched.
-- Atomic with apply_goods_fiscal_plan, AFTER purchases and wages. No inferred cash.
ALTER TABLE public.financial_state_transfers DROP CONSTRAINT financial_state_transfers_direction_check;
ALTER TABLE public.financial_state_transfers DROP CONSTRAINT financial_state_transfers_check;
ALTER TABLE public.financial_state_transfers DROP CONSTRAINT financial_state_transfers_purpose_check;
ALTER TABLE public.financial_state_transfers DROP CONSTRAINT financial_state_transfers_private_purpose;
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_direction_check
 CHECK (direction IN ('STATE_TO_MUNICIPAL','MUNICIPAL_TO_STATE','STATE_TO_PRIVATE','PRIVATE_TO_STATE'));
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_check
 CHECK ((direction IN ('STATE_TO_MUNICIPAL','STATE_TO_PRIVATE') AND state_gold_after=state_gold_before-amount)
     OR (direction IN ('MUNICIPAL_TO_STATE','PRIVATE_TO_STATE') AND state_gold_after=state_gold_before+amount));
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_purpose_check
 CHECK ((direction='STATE_TO_PRIVATE' AND purpose='pilot_liquidity_grant')
     OR (direction='PRIVATE_TO_STATE' AND purpose IN ('cash_poll_tax','cash_domestic_tax'))
     OR (direction IN ('STATE_TO_MUNICIPAL','MUNICIPAL_TO_STATE') AND purpose IS NULL));

CREATE TABLE public.financial_cash_tax_flows (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id),
 turn_number integer NOT NULL,
 city_id uuid NOT NULL REFERENCES public.cities(id),
 pillar text NOT NULL CHECK (pillar IN ('POLL','DOMESTIC')),
 assessed numeric(20,3) NOT NULL CHECK (assessed>=0 AND assessed=trunc(assessed)),
 settled numeric(20,3) NOT NULL CHECK (settled>=0 AND settled=trunc(settled)),
 unpaid numeric(20,3) NOT NULL CHECK (unpaid>=0 AND unpaid=trunc(unpaid)),
 status text NOT NULL CHECK (status IN ('settled','partial','unfunded','no_controller')),
 payer_account_id uuid,
 state_transfer_id uuid REFERENCES public.financial_state_transfers(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,turn_number,city_id,pillar),
 CHECK (settled+unpaid=assessed),
 FOREIGN KEY(session_id,payer_account_id) REFERENCES public.financial_accounts(session_id,id)
);
REVOKE ALL ON public.financial_cash_tax_flows FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_cash_tax_flows TO authenticated;
GRANT ALL ON public.financial_cash_tax_flows TO service_role;
ALTER TABLE public.financial_cash_tax_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_cash_tax_flows_read ON public.financial_cash_tax_flows
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.financial_accounts a
 JOIN public.game_players gp ON gp.session_id=a.session_id AND gp.user_id=a.controller_user_id
 JOIN public.cities c ON c.id=a.city_id AND c.session_id=a.session_id
 WHERE a.session_id=financial_cash_tax_flows.session_id
 AND a.city_id=financial_cash_tax_flows.city_id
 AND c.owner_player=gp.player_name
 AND a.city_group AND a.controller_user_id=auth.uid()));

CREATE FUNCTION public.settle_cash_taxes(p_session uuid,p_player text,p_turn integer,p_claims jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 f jsonb; c uuid; ctrl uuid; due_poll numeric; eff_dom numeric; due_dom numeric;
 due numeric; paid numeric; st text; kind text; pillar text; purpose text;
 payer public.financial_accounts; treasury public.realm_resources;
 state_before integer; state_after integer; state_transfer uuid; cash_collected numeric:=0;
 request_total numeric:=0; cash_poll numeric:=0; cash_domestic numeric:=0;
 BEGIN
 IF coalesce((SELECT private_cash_version FROM public.game_sessions WHERE id=p_session),0)<1 THEN RETURN; END IF;
 IF p_claims IS NULL OR jsonb_typeof(p_claims)<>'array' THEN RAISE EXCEPTION 'Cash tax claims unavailable'; END IF;
 -- Cash tax can run only as part of the pending authoritative fiscal turn.
 PERFORM 1 FROM public.game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM public.realm_resources r JOIN public.game_sessions gs ON gs.id=r.session_id
   WHERE r.session_id=p_session AND r.player_name=p_player
     AND r.last_processed_turn=p_turn AND gs.resolving_turn=p_turn)
 THEN RAISE EXCEPTION 'Cash tax outside authoritative fiscal turn'; END IF;
 IF EXISTS(SELECT 1 FROM public.financial_cash_tax_flows
    WHERE session_id=p_session AND turn_number=p_turn)
 THEN RAISE EXCEPTION 'Cash tax for turn already settled'; END IF;
 SELECT * INTO STRICT treasury FROM public.realm_resources
 WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
 SELECT gp.user_id INTO ctrl FROM public.game_players gp
 WHERE gp.session_id=p_session AND gp.player_name=p_player;
 FOR f IN SELECT value FROM jsonb_array_elements(p_claims) ORDER BY value->>'city' LOOP
   c:=(f->>'city')::uuid;
   due_poll:=(f->>'poll_due')::numeric;
   eff_dom:=(f->>'domestic_effective_rate')::numeric;
   IF c IS NULL OR due_poll IS NULL OR due_poll='NaN'::numeric OR due_poll<0
    OR due_poll>100000 OR due_poll<>trunc(due_poll)
    OR eff_dom IS NULL OR eff_dom='NaN'::numeric OR eff_dom<0 OR eff_dom>1
    OR NOT EXISTS (SELECT 1 FROM public.cities WHERE id=c AND session_id=p_session AND owner_player=p_player)
   THEN RAISE EXCEPTION 'Invalid cash tax assessment'; END IF;
   -- Tax only actual paid, traceable household->business purchase transfers.
   -- A synthetic or unmatched physical consumption row is never a cash tax base.
   SELECT round(coalesce(sum(pf.settled),0)*eff_dom) INTO due_dom
   FROM public.financial_purchase_flows pf
   JOIN public.financial_transfers ft ON ft.session_id=pf.session_id
    AND ft.id=pf.transfer_id AND ft.amount=pf.settled
   JOIN public.financial_accounts buyer ON buyer.session_id=pf.session_id
    AND buyer.id=ft.source_account_id AND buyer.city_id=c AND buyer.owner_kind='HOUSEHOLD' AND buyer.city_group
   JOIN public.financial_accounts seller ON seller.session_id=pf.session_id
    AND seller.id=ft.destination_account_id AND seller.city_id=c AND seller.owner_kind='BUSINESS' AND seller.city_group
    WHERE pf.session_id=p_session AND pf.turn_number=p_turn AND pf.seller_city_id=c
      AND pf.city_id=c AND pf.status IN ('settled','partial') AND pf.settled>0;
   IF due_dom>100000 THEN RAISE EXCEPTION 'Domestic cash tax assessment exceeds limit'; END IF;
   FOR pillar,due,kind,purpose IN
    SELECT 'POLL',due_poll,'HOUSEHOLD','cash_poll_tax'
    UNION ALL SELECT 'DOMESTIC',due_dom,'BUSINESS','cash_domestic_tax'
   LOOP
    request_total:=request_total+due;
    payer:=NULL; paid:=0; state_transfer:=NULL;
    IF ctrl IS NOT NULL THEN
      SELECT * INTO payer FROM public.financial_accounts
       WHERE session_id=p_session AND city_id=c AND city_group
        AND sector='PRIVATE' AND owner_kind=kind AND controller_user_id=ctrl FOR UPDATE;
      IF payer.id IS NOT NULL THEN paid:=least(due,trunc(payer.balance)); END IF;
    END IF;
    IF paid>0 THEN
      state_before:=treasury.gold_reserve;
      UPDATE public.financial_accounts SET balance=balance-paid
       WHERE session_id=p_session AND id=payer.id RETURNING * INTO payer;
      UPDATE public.realm_resources SET gold_reserve=gold_reserve+paid::integer
       WHERE id=treasury.id RETURNING gold_reserve INTO state_after;
      treasury.gold_reserve:=state_after;
      INSERT INTO public.financial_state_transfers
       (session_id,command_id,realm_id,account_id,direction,amount,
        state_gold_before,state_gold_after,account_balance_after,actor_user_id,purpose)
      VALUES(p_session,md5('cash-tax:'||p_session::text||':'||p_turn::text||':'||c::text||':'||pillar)::uuid,
        treasury.id,payer.id,'PRIVATE_TO_STATE',paid,
        state_before,state_after,payer.balance,ctrl,purpose)
       RETURNING id INTO state_transfer;
      cash_collected:=cash_collected+paid;
      IF pillar='POLL' THEN cash_poll:=cash_poll+paid; ELSE cash_domestic:=cash_domestic+paid; END IF;
    END IF;
    st:=CASE WHEN ctrl IS NULL THEN 'no_controller'
             WHEN due=paid THEN 'settled'
             WHEN paid>0 THEN 'partial' ELSE 'unfunded' END;
    INSERT INTO public.financial_cash_tax_flows
     (session_id,turn_number,city_id,pillar,assessed,settled,unpaid,status,payer_account_id,state_transfer_id)
    VALUES(p_session,p_turn,c,pillar,due,paid,due-paid,st,payer.id,state_transfer);
   END LOOP;
 END LOOP;
 -- Every STATE credit is an actual matched PRIVATE debit. Update the frozen fiscal breakdown
 -- in this SAME transaction, so cash-revenue and closing treasury remain consistent.
 UPDATE public.realm_resources
 SET wealth_pop_tax=cash_poll, wealth_domestic_market=cash_domestic,
     goods_wealth_fiscal=0, total_wealth=cash_collected,
     computed_modifiers=jsonb_set(
       jsonb_set(coalesce(computed_modifiers,'{}'::jsonb),
         '{wealth_breakdown}',
         coalesce(computed_modifiers->'wealth_breakdown','{}'::jsonb) ||
         jsonb_build_object(
           'fiscal_revenue',cash_collected,
           'pop_tax',cash_poll,
           'domestic_market',cash_domestic,
           'goods_fiscal',0,
           'goods_fiscal_detail',jsonb_build_object('market_tariff',0,'transit_toll',0,'extraction_tax',0),
           'total_income',coalesce((computed_modifiers->'wealth_breakdown'->>'total_income')::numeric,0)+cash_collected,
           'treasury_closing',gold_reserve,
           'turn_fiscal_delta',gold_reserve-coalesce(
             (computed_modifiers->'wealth_breakdown'->>'treasury_opening')::numeric,gold_reserve)
         ),true),
       '{cash_tax_settlement}',jsonb_build_object('turn',p_turn,'assessed',request_total,
         'collected',cash_collected,'poll_collected',cash_poll,'domestic_collected',cash_domestic,
         'unpaid',request_total-cash_collected,
         'basis','cash_backed_poll_and_verified_local_domestic'),true)
 WHERE id=treasury.id;
END $$;
REVOKE ALL ON FUNCTION public.settle_cash_taxes(uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cash_taxes(uuid,text,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_plan(
 p_session uuid,p_player text,p_turn integer,p_patch jsonb,p_gold_delta numeric,
 p_capex_delta numeric,p_writes jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT public.apply_goods_fiscal_turn(p_session,p_player,p_turn,p_patch,p_gold_delta,p_capex_delta)
 THEN RETURN false; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 PERFORM public.settle_household_purchases(p_session,p_player,p_turn,
   p_patch->'computed_modifiers'->'household_purchase_candidates');
 PERFORM public.settle_private_cash_turn(p_session,p_player,p_turn,
   p_patch->'computed_modifiers'->'private_cash_flows');
 PERFORM public.settle_cash_taxes(p_session,p_player,p_turn,
   p_patch->'computed_modifiers'->'cash_tax_claims');
 RETURN true;
END $$;