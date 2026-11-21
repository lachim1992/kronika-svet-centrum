CREATE TABLE public.financial_purchase_flows (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id),
 turn_number integer NOT NULL,
 city_id uuid NOT NULL REFERENCES public.cities(id),
 good_key text NOT NULL CHECK (length(good_key) BETWEEN 1 AND 80),
 seller_city_id uuid REFERENCES public.cities(id),
 consumed numeric(20,3) NOT NULL CHECK (consumed >= 0),
 unit_price numeric(20,6),
 bill numeric(20,3) NOT NULL CHECK (bill >= 0),
 settled numeric(20,3) NOT NULL CHECK (settled >= 0),
 unpaid numeric(20,3) NOT NULL CHECK (unpaid >= 0),
 status text NOT NULL CHECK (status IN ('settled','partial','unfunded','unmatched','no_price','no_controller')),
 transfer_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,turn_number,city_id,good_key),
 CHECK (settled + unpaid = bill),
 CHECK (status NOT IN ('settled','partial','unfunded') OR seller_city_id IS NOT NULL),
 FOREIGN KEY(session_id,transfer_id) REFERENCES public.financial_transfers(session_id,id)
);
REVOKE ALL ON public.financial_purchase_flows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_purchase_flows TO authenticated;
GRANT ALL ON public.financial_purchase_flows TO service_role;
ALTER TABLE public.financial_purchase_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_purchase_flows_read ON public.financial_purchase_flows FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.session_id=financial_purchase_flows.session_id AND a.city_id=financial_purchase_flows.city_id AND a.city_group));

CREATE FUNCTION public.settle_household_purchases(p_session uuid,p_player text,p_turn integer,p_cands jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f jsonb; c uuid; seller uuid; g text; qty numeric; price numeric; bill numeric; st text; ctrl uuid; biz public.financial_accounts; hh public.financial_accounts; paid numeric; tid uuid; cmd uuid;
BEGIN
 IF coalesce((SELECT private_cash_version FROM public.game_sessions WHERE id=p_session),0) < 1 OR p_cands IS NULL OR jsonb_typeof(p_cands)<>'array' THEN RETURN; END IF;
 SELECT gp.user_id INTO ctrl FROM public.game_players gp WHERE gp.session_id=p_session AND gp.player_name=p_player;
 FOR f IN SELECT value FROM jsonb_array_elements(p_cands) ORDER BY value->>'city', value->>'good' LOOP
  c:=(f->>'city')::uuid; g:=f->>'good'; seller:=nullif(f->>'seller','')::uuid;
  qty:=round(greatest(coalesce((f->>'consumed')::numeric,0),0),3); price:=(f->>'unit_price')::numeric;
  IF g IS NULL OR NOT EXISTS(SELECT 1 FROM public.cities WHERE id=c AND session_id=p_session AND owner_player=p_player) THEN RAISE EXCEPTION 'Invalid household purchase'; END IF;
  -- Stage 2B/2: only same-city sellers are provable (stock carries no lot provenance across cities).
  IF seller IS NOT NULL AND seller<>c THEN seller:=NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_purchase_flows WHERE session_id=p_session AND turn_number=p_turn AND city_id=c AND good_key=g) THEN CONTINUE; END IF;
  IF price IS NULL OR price::text IN ('NaN','Infinity','-Infinity') OR price<=0 THEN
   INSERT INTO public.financial_purchase_flows VALUES(p_session,p_turn,c,g,seller,qty,NULL,0,0,0,'no_price',NULL); CONTINUE; END IF;
  bill:=round(qty*price,3);
  IF seller IS NULL THEN INSERT INTO public.financial_purchase_flows VALUES(p_session,p_turn,c,g,NULL,qty,price,0,0,0,'unmatched',NULL); CONTINUE; END IF;
  IF ctrl IS NULL THEN INSERT INTO public.financial_purchase_flows VALUES(p_session,p_turn,c,g,seller,qty,price,bill,0,bill,'no_controller',NULL); CONTINUE; END IF;
  INSERT INTO public.financial_accounts(session_id,sector,owner_kind,controller_user_id,city_id,label,city_group)
   VALUES(p_session,'PRIVATE','BUSINESS',ctrl,c,'Podniky města',true),(p_session,'PRIVATE','HOUSEHOLD',ctrl,c,'Domácnosti města',true)
   ON CONFLICT (session_id,city_id,owner_kind) WHERE city_group DO NOTHING;
  -- Same lock order as settle_private_cash_turn: business, then household.
  SELECT * INTO biz FROM public.financial_accounts WHERE session_id=p_session AND city_id=seller AND owner_kind='BUSINESS' AND city_group FOR UPDATE;
  SELECT * INTO hh FROM public.financial_accounts WHERE session_id=p_session AND city_id=c AND owner_kind='HOUSEHOLD' AND city_group FOR UPDATE;
  paid:=least(bill,hh.balance); tid:=NULL;
  IF paid>0 THEN
   cmd:=md5('household-purchase:'||p_session::text||':'||p_turn::text||':'||c::text||':'||g||':'||seller::text)::uuid;
   UPDATE public.financial_accounts SET balance=balance-paid WHERE session_id=p_session AND id=hh.id RETURNING * INTO hh;
   UPDATE public.financial_accounts SET balance=balance+paid WHERE session_id=p_session AND id=biz.id RETURNING * INTO biz;
   INSERT INTO public.financial_transfers(session_id,command_id,source_account_id,destination_account_id,amount,actor_user_id) VALUES(p_session,cmd,hh.id,biz.id,paid,ctrl) RETURNING id INTO tid;
   INSERT INTO public.financial_entries VALUES(p_session,tid,hh.id,-paid,hh.balance),(p_session,tid,biz.id,paid,biz.balance);
  END IF;
  st:=CASE WHEN bill=0 OR paid=bill THEN 'settled' WHEN paid>0 THEN 'partial' ELSE 'unfunded' END;
  INSERT INTO public.financial_purchase_flows VALUES(p_session,p_turn,c,g,seller,qty,price,bill,paid,bill-paid,st,tid);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.settle_household_purchases(uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_plan(p_session uuid, p_player text, p_turn integer, p_patch jsonb, p_gold_delta numeric, p_capex_delta numeric, p_writes jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT public.apply_goods_fiscal_turn(p_session,p_player,p_turn,p_patch,p_gold_delta,p_capex_delta) THEN RETURN false; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 -- Same transaction and turn guard; no-ops for legacy sessions. Purchases settle before wages/ownership.
 PERFORM public.settle_household_purchases(p_session,p_player,p_turn,p_patch->'computed_modifiers'->'household_purchase_candidates');
 PERFORM public.settle_private_cash_turn(p_session,p_player,p_turn,p_patch->'computed_modifiers'->'private_cash_flows');
 RETURN true;
END $function$;