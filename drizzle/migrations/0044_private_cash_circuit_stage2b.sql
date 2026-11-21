ALTER TABLE public.game_sessions ADD COLUMN private_cash_version integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.game_sessions.private_cash_version IS '0 = legacy modelled wage settlement only; >=1 = cash-backed private flows settled inside apply_goods_fiscal_plan.';

ALTER TABLE public.financial_accounts ADD COLUMN city_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_city_group CHECK (NOT city_group OR (sector='PRIVATE' AND owner_kind IN ('HOUSEHOLD','BUSINESS') AND city_id IS NOT NULL));
CREATE UNIQUE INDEX financial_one_city_group_account ON public.financial_accounts(session_id,city_id,owner_kind) WHERE city_group;

CREATE TABLE public.financial_turn_flows (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id),
 turn_number integer NOT NULL,
 city_id uuid NOT NULL REFERENCES public.cities(id),
 flow_type text NOT NULL CHECK (flow_type IN ('WAGES','OWNERSHIP_INCOME')),
 requested numeric(20,3) NOT NULL CHECK (requested >= 0),
 settled numeric(20,3) NOT NULL CHECK (settled >= 0),
 unpaid numeric(20,3) NOT NULL CHECK (unpaid >= 0),
 status text NOT NULL CHECK (status IN ('settled','partial','unfunded','no_controller')),
 transfer_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,turn_number,city_id,flow_type),
 CHECK (settled + unpaid = requested),
 FOREIGN KEY(session_id,transfer_id) REFERENCES public.financial_transfers(session_id,id)
);
REVOKE ALL ON public.financial_turn_flows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_turn_flows TO authenticated;
GRANT ALL ON public.financial_turn_flows TO service_role;
ALTER TABLE public.financial_turn_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_turn_flows_read ON public.financial_turn_flows FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.session_id=financial_turn_flows.session_id AND a.city_id=financial_turn_flows.city_id AND a.city_group));

CREATE FUNCTION public.settle_private_cash_turn(p_session uuid,p_player text,p_turn integer,p_flows jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f jsonb; c uuid; typ text; req numeric; ctrl uuid; biz public.financial_accounts; hh public.financial_accounts; paid numeric; tid uuid; cmd uuid;
BEGIN
 IF coalesce((SELECT private_cash_version FROM public.game_sessions WHERE id=p_session),0) < 1 OR p_flows IS NULL OR jsonb_typeof(p_flows)<>'array' THEN RETURN; END IF;
 SELECT gp.user_id INTO ctrl FROM public.game_players gp WHERE gp.session_id=p_session AND gp.player_name=p_player;
 FOR f IN SELECT value FROM jsonb_array_elements(p_flows) ORDER BY value->>'city', value->>'flow_type' LOOP
  c:=(f->>'city')::uuid; typ:=f->>'flow_type'; req:=round(greatest(coalesce((f->>'amount')::numeric,0),0),3);
  IF typ NOT IN ('WAGES','OWNERSHIP_INCOME') OR NOT EXISTS(SELECT 1 FROM public.cities WHERE id=c AND session_id=p_session AND owner_player=p_player) THEN RAISE EXCEPTION 'Invalid private cash flow'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_turn_flows WHERE session_id=p_session AND turn_number=p_turn AND city_id=c AND flow_type=typ) THEN CONTINUE; END IF;
  IF ctrl IS NULL THEN
   INSERT INTO public.financial_turn_flows VALUES(p_session,p_turn,c,typ,req,0,req,'no_controller',NULL); CONTINUE;
  END IF;
  -- Canonical zero-opening city-group accounts; never funded from GDP or modelled producer cash.
  INSERT INTO public.financial_accounts(session_id,sector,owner_kind,controller_user_id,city_id,label,city_group)
   VALUES(p_session,'PRIVATE','BUSINESS',ctrl,c,'Podniky města','true'),(p_session,'PRIVATE','HOUSEHOLD',ctrl,c,'Domácnosti města',true)
   ON CONFLICT (session_id,city_id,owner_kind) WHERE city_group DO NOTHING;
  -- Lock order: business then household (stable per city).
  SELECT * INTO biz FROM public.financial_accounts WHERE session_id=p_session AND city_id=c AND owner_kind='BUSINESS' AND city_group FOR UPDATE;
  SELECT * INTO hh FROM public.financial_accounts WHERE session_id=p_session AND city_id=c AND owner_kind='HOUSEHOLD' AND city_group FOR UPDATE;
  paid:=least(req,biz.balance); tid:=NULL;
  IF paid>0 THEN
   cmd:=md5('private-cash:'||p_session::text||':'||p_turn::text||':'||c::text||':'||typ)::uuid;
   UPDATE public.financial_accounts SET balance=balance-paid WHERE session_id=p_session AND id=biz.id RETURNING * INTO biz;
   UPDATE public.financial_accounts SET balance=balance+paid WHERE session_id=p_session AND id=hh.id RETURNING * INTO hh;
   INSERT INTO public.financial_transfers(session_id,command_id,source_account_id,destination_account_id,amount,actor_user_id) VALUES(p_session,cmd,biz.id,hh.id,paid,ctrl) RETURNING id INTO tid;
   INSERT INTO public.financial_entries VALUES(p_session,tid,biz.id,-paid,biz.balance),(p_session,tid,hh.id,paid,hh.balance);
  END IF;
  INSERT INTO public.financial_turn_flows VALUES(p_session,p_turn,c,typ,req,paid,req-paid,CASE WHEN req=0 OR paid=req THEN 'settled' WHEN paid>0 THEN 'partial' ELSE 'unfunded' END,tid);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.settle_private_cash_turn(uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_plan(p_session uuid, p_player text, p_turn integer, p_patch jsonb, p_gold_delta numeric, p_capex_delta numeric, p_writes jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT public.apply_goods_fiscal_turn(p_session,p_player,p_turn,p_patch,p_gold_delta,p_capex_delta) THEN RETURN false; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 -- Same transaction and same turn guard: opt-in cash-backed private flows (no-op for legacy sessions).
 PERFORM public.settle_private_cash_turn(p_session,p_player,p_turn,p_patch->'computed_modifiers'->'private_cash_flows');
 RETURN true;
END $function$;