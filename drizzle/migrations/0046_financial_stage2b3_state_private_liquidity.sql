-- Stage 2B/3: explicit STATE gold_reserve -> own city-group PRIVATE liquidity grant (pilot, opt-in sessions only).
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.financial_state_transfers'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%direction%' LOOP
  EXECUTE format('ALTER TABLE public.financial_state_transfers DROP CONSTRAINT %I', r.conname);
 END LOOP; END $$;
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_direction_check CHECK (direction IN ('STATE_TO_MUNICIPAL','MUNICIPAL_TO_STATE','STATE_TO_PRIVATE'));
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_check CHECK ((direction IN ('STATE_TO_MUNICIPAL','STATE_TO_PRIVATE') AND state_gold_after = state_gold_before - amount) OR (direction='MUNICIPAL_TO_STATE' AND state_gold_after = state_gold_before + amount));
ALTER TABLE public.financial_state_transfers ADD COLUMN purpose text CHECK (purpose IS NULL OR purpose='pilot_liquidity_grant');
ALTER TABLE public.financial_state_transfers ADD CONSTRAINT financial_state_transfers_private_purpose CHECK ((direction='STATE_TO_PRIVATE') = (purpose IS NOT NULL));
COMMENT ON COLUMN public.financial_state_transfers.purpose IS 'pilot_liquidity_grant = explicit STATE subsidy to own city-group PRIVATE account; NULL for municipal transfers.';
COMMENT ON TABLE public.financial_state_transfers IS 'Explicit STATE<->MUNICIPAL and STATE->PRIVATE ledger. STATE balance is only realm_resources.gold_reserve; each row records both sides of one atomic command.';

CREATE OR REPLACE FUNCTION public.execute_financial_command(p_session uuid,p_actor uuid,p_command uuid,p_type text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.game_sessions; player_name_verified text; prior public.financial_commands; src public.financial_accounts; dst public.financial_accounts; account public.financial_accounts; city uuid; amount numeric; transfer_id uuid; event_id uuid; output jsonb; realm public.realm_resources; state_after integer;
BEGIN
 IF p_session IS NULL OR p_actor IS NULL OR p_command IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR p_type NOT IN ('CREATE_FINANCIAL_ACCOUNT','TRANSFER_FINANCIAL_FUNDS','FUND_MUNICIPAL_ACCOUNT','REMIT_MUNICIPAL_TO_STATE','GRANT_PRIVATE_LIQUIDITY') OR p_type IS NULL THEN RAISE EXCEPTION 'Invalid financial command'; END IF;
 -- Internal RPC is callable only by the command gateway's service role; p_actor is its verified JWT identity.
 SELECT gp.player_name INTO STRICT player_name_verified FROM public.game_players gp WHERE gp.session_id=p_session AND gp.user_id=p_actor;
 -- Share the turn/session lock: never cross an authoritative turn settlement.
 SELECT * INTO s FROM public.game_sessions WHERE id=p_session FOR UPDATE;
 IF s.id IS NULL OR s.resolving_turn IS NOT NULL THEN RAISE EXCEPTION 'Session unavailable or resolving'; END IF;
 SELECT * INTO prior FROM public.financial_commands WHERE session_id=p_session AND command_id=p_command;
 IF FOUND THEN
  IF prior.actor_user_id<>p_actor OR prior.command_type<>p_type OR prior.arguments<>p_args THEN RAISE EXCEPTION 'Financial command replay conflict'; END IF;
  RETURN prior.result || jsonb_build_object('idempotent',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.game_events WHERE session_id=p_session AND command_id=p_command) THEN RAISE EXCEPTION 'Command key already used'; END IF;
 IF p_type='CREATE_FINANCIAL_ACCOUNT' THEN
  IF p_args - ARRAY['sector','owner_kind','organization_kind','city_id','label'] <> '{}'::jsonb OR coalesce(length(btrim(p_args->>'label')),0) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid account arguments'; END IF;
  city:=nullif(p_args->>'city_id','')::uuid;
  IF city IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cities c WHERE c.id=city AND c.session_id=p_session AND c.owner_player=player_name_verified) THEN RAISE EXCEPTION 'City not controlled by verified player'; END IF;
  INSERT INTO public.financial_accounts(session_id,sector,owner_kind,organization_kind,controller_user_id,city_id,label) VALUES(p_session,p_args->>'sector',p_args->>'owner_kind',nullif(p_args->>'organization_kind',''),p_actor,city,btrim(p_args->>'label')) RETURNING * INTO account;
  output:=jsonb_build_object('account_id',account.id,'balance',account.balance);
 ELSIF p_type IN ('FUND_MUNICIPAL_ACCOUNT','REMIT_MUNICIPAL_TO_STATE') THEN
  -- STATE stays realm_resources.gold_reserve (integer); no second STATE balance exists.
  IF p_args - ARRAY['account_id','amount'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Invalid state transfer arguments'; END IF;
  IF jsonb_typeof(p_args->'amount') NOT IN ('number','string') THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  amount:=(p_args->>'amount')::numeric;
  IF amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity') OR amount<=0 OR amount<>trunc(amount) OR amount>2000000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  -- Lock order: session (above) -> realm_resources -> financial account.
  SELECT * INTO STRICT realm FROM public.realm_resources WHERE session_id=p_session AND player_name=player_name_verified FOR UPDATE;
  SELECT * INTO account FROM public.financial_accounts WHERE session_id=p_session AND id=(p_args->>'account_id')::uuid FOR UPDATE;
  IF account.id IS NULL OR account.sector<>'MUNICIPAL' OR account.controller_user_id<>p_actor THEN RAISE EXCEPTION 'Accounts unavailable or unauthorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cities c WHERE c.id=account.city_id AND c.session_id=p_session AND c.owner_player=player_name_verified) THEN RAISE EXCEPTION 'City no longer controlled'; END IF;
  IF p_type='FUND_MUNICIPAL_ACCOUNT' THEN
   IF realm.gold_reserve<amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
   UPDATE public.realm_resources SET gold_reserve=gold_reserve-amount::integer WHERE id=realm.id RETURNING gold_reserve INTO state_after;
   UPDATE public.financial_accounts SET balance=balance+amount WHERE session_id=p_session AND id=account.id RETURNING * INTO account;
  ELSE
   IF account.balance<amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
   UPDATE public.financial_accounts SET balance=balance-amount WHERE session_id=p_session AND id=account.id RETURNING * INTO account;
   UPDATE public.realm_resources SET gold_reserve=gold_reserve+amount::integer WHERE id=realm.id RETURNING gold_reserve INTO state_after;
  END IF;
  INSERT INTO public.financial_state_transfers(session_id,command_id,realm_id,account_id,direction,amount,state_gold_before,state_gold_after,account_balance_after,actor_user_id)
   VALUES(p_session,p_command,realm.id,account.id,CASE WHEN p_type='FUND_MUNICIPAL_ACCOUNT' THEN 'STATE_TO_MUNICIPAL' ELSE 'MUNICIPAL_TO_STATE' END,amount,realm.gold_reserve,state_after,account.balance,p_actor) RETURNING id INTO transfer_id;
  output:=jsonb_build_object('state_transfer_id',transfer_id,'state_gold_after',state_after,'account_balance',account.balance);
 ELSIF p_type='GRANT_PRIVATE_LIQUIDITY' THEN
  -- Explicit pilot subsidy: the ONLY legal credit source for city-group PRIVATE cash is existing STATE gold.
  IF coalesce(s.private_cash_version,0)<1 THEN RAISE EXCEPTION 'Private cash circuit not enabled for session'; END IF;
  IF p_args - ARRAY['city_id','owner_kind','amount'] <> '{}'::jsonb OR p_args->>'owner_kind' NOT IN ('HOUSEHOLD','BUSINESS') OR p_args->>'owner_kind' IS NULL THEN RAISE EXCEPTION 'Invalid grant arguments'; END IF;
  IF jsonb_typeof(p_args->'amount') NOT IN ('number','string') THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  amount:=(p_args->>'amount')::numeric;
  IF amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity') OR amount<=0 OR amount<>trunc(amount) OR amount>100000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  city:=(p_args->>'city_id')::uuid;
  -- Lock order: session (above) -> realm_resources -> financial account.
  SELECT * INTO STRICT realm FROM public.realm_resources WHERE session_id=p_session AND player_name=player_name_verified FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.cities c WHERE c.id=city AND c.session_id=p_session AND c.owner_player=player_name_verified) THEN RAISE EXCEPTION 'City not controlled by verified player'; END IF;
  -- Zero-opening account for this one owned city only; never funded on creation.
  INSERT INTO public.financial_accounts(session_id,sector,owner_kind,controller_user_id,city_id,label,city_group)
   VALUES(p_session,'PRIVATE',p_args->>'owner_kind',p_actor,city,CASE WHEN p_args->>'owner_kind'='BUSINESS' THEN 'Podniky města' ELSE 'Domácnosti města' END,true)
   ON CONFLICT (session_id,city_id,owner_kind) WHERE city_group DO NOTHING;
  SELECT * INTO account FROM public.financial_accounts WHERE session_id=p_session AND city_id=city AND owner_kind=p_args->>'owner_kind' AND city_group FOR UPDATE;
  IF account.id IS NULL OR account.sector<>'PRIVATE' OR account.controller_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Accounts unavailable or unauthorized'; END IF;
  IF realm.gold_reserve<amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
  UPDATE public.realm_resources SET gold_reserve=gold_reserve-amount::integer WHERE id=realm.id RETURNING gold_reserve INTO state_after;
  UPDATE public.financial_accounts SET balance=balance+amount WHERE session_id=p_session AND id=account.id RETURNING * INTO account;
  INSERT INTO public.financial_state_transfers(session_id,command_id,realm_id,account_id,direction,amount,state_gold_before,state_gold_after,account_balance_after,actor_user_id,purpose)
   VALUES(p_session,p_command,realm.id,account.id,'STATE_TO_PRIVATE',amount,realm.gold_reserve,state_after,account.balance,p_actor,'pilot_liquidity_grant') RETURNING id INTO transfer_id;
  output:=jsonb_build_object('state_transfer_id',transfer_id,'account_id',account.id,'state_gold_after',state_after,'account_balance',account.balance);
 ELSE
  IF p_args - ARRAY['source_account_id','destination_account_id','amount'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Invalid transfer arguments'; END IF;
  amount:=(p_args->>'amount')::numeric;
  IF amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity') OR amount<=0 OR amount<>round(amount,3) OR amount>=100000000000000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF (p_args->>'source_account_id')::uuid=(p_args->>'destination_account_id')::uuid THEN RAISE EXCEPTION 'Same account'; END IF;
  PERFORM 1 FROM public.financial_accounts WHERE session_id=p_session AND id IN ((p_args->>'source_account_id')::uuid,(p_args->>'destination_account_id')::uuid) ORDER BY id FOR UPDATE;
  SELECT * INTO src FROM public.financial_accounts WHERE session_id=p_session AND id=(p_args->>'source_account_id')::uuid;
  SELECT * INTO dst FROM public.financial_accounts WHERE session_id=p_session AND id=(p_args->>'destination_account_id')::uuid;
  IF src.id IS NULL OR dst.id IS NULL OR src.controller_user_id<>p_actor THEN RAISE EXCEPTION 'Accounts unavailable or unauthorized'; END IF;
  IF src.city_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cities c WHERE c.id=src.city_id AND c.session_id=p_session AND c.owner_player=player_name_verified) THEN RAISE EXCEPTION 'City no longer controlled'; END IF;
  IF src.balance<amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
  UPDATE public.financial_accounts SET balance=balance-amount WHERE session_id=p_session AND id=src.id RETURNING * INTO src;
  UPDATE public.financial_accounts SET balance=balance+amount WHERE session_id=p_session AND id=dst.id RETURNING * INTO dst;
  INSERT INTO public.financial_transfers(session_id,command_id,source_account_id,destination_account_id,amount,actor_user_id) VALUES(p_session,p_command,src.id,dst.id,amount,p_actor) RETURNING id INTO transfer_id;
  INSERT INTO public.financial_entries(session_id,transfer_id,account_id,delta,balance_after) VALUES(p_session,transfer_id,src.id,-amount,src.balance),(p_session,transfer_id,dst.id,amount,dst.balance);
  output:=jsonb_build_object('transfer_id',transfer_id,'source_balance',src.balance,'destination_balance',dst.balance);
 END IF;
 INSERT INTO public.game_events(session_id,command_id,event_type,player,actor_type,turn_number,confirmed,truth_state,reference,processed_at) VALUES(p_session,p_command,p_type,player_name_verified,'player',s.current_turn,true,'canon',jsonb_build_object('financial_command',p_type),now()) RETURNING id INTO event_id;
 output:=output || jsonb_build_object('events',jsonb_build_array(jsonb_build_object('id',event_id,'event_type',p_type,'command_id',p_command)),'idempotent',false);
 INSERT INTO public.financial_commands VALUES(p_session,p_command,p_actor,p_type,p_args,output);
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION public.scope_financial_event_key() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type IN ('CREATE_FINANCIAL_ACCOUNT','TRANSFER_FINANCIAL_FUNDS','FUND_MUNICIPAL_ACCOUNT','REMIT_MUNICIPAL_TO_STATE','GRANT_PRIVATE_LIQUIDITY') THEN
  IF current_user IN ('authenticated','anon') OR coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') IN ('authenticated','anon') THEN RAISE EXCEPTION 'Financial events are server-written' USING ERRCODE='42501'; END IF;
  IF NEW.command_id IS NULL THEN RAISE EXCEPTION 'Financial event requires command key'; END IF;
  IF TG_OP='INSERT' THEN
   NEW.reference:=NEW.reference || jsonb_build_object('financial_command_id',NEW.command_id);
   NEW.command_id:=md5('financial:' || NEW.session_id::text || ':' || NEW.command_id::text)::uuid;
  END IF;
 END IF;
 RETURN NEW;
END $$;