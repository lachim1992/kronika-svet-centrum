CREATE TABLE public.financial_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.game_sessions(id),
 sector text NOT NULL CHECK (sector IN ('MUNICIPAL','PRIVATE','ORGANIZATION')),
 owner_kind text NOT NULL CHECK (owner_kind IN ('CITY','HOUSEHOLD','BUSINESS','ORGANIZATION')),
 controller_user_id uuid NOT NULL,
 city_id uuid REFERENCES public.cities(id),
 label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
 balance numeric(20,3) NOT NULL DEFAULT 0 CHECK (balance >= 0 AND balance <> 'NaN'::numeric),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,id),
 CHECK ((sector='MUNICIPAL' AND owner_kind='CITY' AND city_id IS NOT NULL) OR (sector='PRIVATE' AND owner_kind IN ('HOUSEHOLD','BUSINESS')) OR (sector='ORGANIZATION' AND owner_kind='ORGANIZATION'))
);
GRANT SELECT ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_accounts_read ON public.financial_accounts FOR SELECT TO authenticated USING (app_private.is_session_member(session_id) AND (controller_user_id=auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE UNIQUE INDEX financial_one_municipal_account ON public.financial_accounts(session_id,city_id) WHERE sector='MUNICIPAL';

CREATE TABLE public.financial_commands (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id),
 command_id uuid NOT NULL,
 actor_user_id uuid NOT NULL,
 command_type text NOT NULL,
 arguments jsonb NOT NULL,
 result jsonb NOT NULL,
 PRIMARY KEY(session_id,command_id)
);
GRANT ALL ON public.financial_commands TO service_role;
ALTER TABLE public.financial_commands ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.financial_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL,
 command_id uuid NOT NULL,
 source_account_id uuid NOT NULL,
 destination_account_id uuid NOT NULL,
 amount numeric(20,3) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
 actor_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,id), UNIQUE(session_id,command_id),
 CHECK(source_account_id <> destination_account_id),
 FOREIGN KEY(session_id,source_account_id) REFERENCES public.financial_accounts(session_id,id),
 FOREIGN KEY(session_id,destination_account_id) REFERENCES public.financial_accounts(session_id,id)
);
GRANT SELECT ON public.financial_transfers TO authenticated;
GRANT ALL ON public.financial_transfers TO service_role;
ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_transfers_read ON public.financial_transfers FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.session_id=financial_transfers.session_id AND a.id IN (source_account_id,destination_account_id)));

CREATE TABLE public.financial_entries (
 session_id uuid NOT NULL,
 transfer_id uuid NOT NULL,
 account_id uuid NOT NULL,
 delta numeric(20,3) NOT NULL CHECK (delta <> 0 AND delta <> 'NaN'::numeric),
 balance_after numeric(20,3) NOT NULL CHECK(balance_after >= 0 AND balance_after <> 'NaN'::numeric),
 PRIMARY KEY(session_id,transfer_id,account_id),
 FOREIGN KEY(session_id,transfer_id) REFERENCES public.financial_transfers(session_id,id),
 FOREIGN KEY(session_id,account_id) REFERENCES public.financial_accounts(session_id,id)
);
GRANT SELECT ON public.financial_entries TO authenticated;
GRANT ALL ON public.financial_entries TO service_role;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_entries_read ON public.financial_entries FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.session_id=financial_entries.session_id AND a.id=account_id));

CREATE FUNCTION public.validate_financial_transfer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.financial_transfers; n integer; net numeric; correct integer;
BEGIN
 SELECT * INTO t FROM public.financial_transfers WHERE session_id=NEW.session_id AND id=NEW.id;
 SELECT count(*),coalesce(sum(delta),0),count(*) FILTER(WHERE (account_id=t.source_account_id AND delta=-t.amount) OR (account_id=t.destination_account_id AND delta=t.amount)) INTO n,net,correct FROM public.financial_entries WHERE session_id=t.session_id AND transfer_id=t.id;
 IF n<>2 OR net<>0 OR correct<>2 THEN RAISE EXCEPTION 'Unbalanced financial transfer'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER financial_transfer_balanced AFTER INSERT ON public.financial_transfers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_financial_transfer();
REVOKE ALL ON FUNCTION public.validate_financial_transfer() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.execute_financial_command(p_session uuid,p_actor uuid,p_command uuid,p_type text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.game_sessions; player_name_verified text; prior public.financial_commands; src public.financial_accounts; dst public.financial_accounts; account public.financial_accounts; city uuid; amount numeric; transfer_id uuid; event_id uuid; output jsonb;
BEGIN
 IF p_session IS NULL OR p_actor IS NULL OR p_command IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR p_type NOT IN ('CREATE_FINANCIAL_ACCOUNT','TRANSFER_FINANCIAL_FUNDS') OR p_type IS NULL THEN RAISE EXCEPTION 'Invalid financial command'; END IF;
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
  IF p_args - ARRAY['sector','owner_kind','city_id','label'] <> '{}'::jsonb OR coalesce(length(btrim(p_args->>'label')),0) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid account arguments'; END IF;
  city:=nullif(p_args->>'city_id','')::uuid;
  IF city IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cities c WHERE c.id=city AND c.session_id=p_session AND c.owner_player=player_name_verified) THEN RAISE EXCEPTION 'City not controlled by verified player'; END IF;
  INSERT INTO public.financial_accounts(session_id,sector,owner_kind,controller_user_id,city_id,label) VALUES(p_session,p_args->>'sector',p_args->>'owner_kind',p_actor,city,btrim(p_args->>'label')) RETURNING * INTO account;
  output:=jsonb_build_object('account_id',account.id,'balance',account.balance);
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
REVOKE ALL ON FUNCTION public.execute_financial_command(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_financial_command(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMENT ON TABLE public.financial_accounts IS 'Stage 1 zero-opening cash accounts only. STATE is read-only realm_resources.gold_reserve; city_capital_stock and legacy wage cash remain separate. No automatic funding or debt.';