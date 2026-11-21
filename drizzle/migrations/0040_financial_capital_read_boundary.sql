CREATE FUNCTION public.read_financial_capital(p_session uuid) RETURNS TABLE(city_id uuid,city_name text,stock numeric,last_turn integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE seat text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT gp.player_name INTO STRICT seat FROM public.game_players gp WHERE gp.session_id=p_session AND gp.user_id=auth.uid();
 RETURN QUERY SELECT cs.city_id,c.name::text,cs.stock,cs.last_turn FROM public.city_capital_stock cs JOIN public.cities c ON c.id=cs.city_id AND c.session_id=cs.session_id WHERE cs.session_id=p_session AND c.owner_player=seat ORDER BY cs.city_id;
END $$;
REVOKE ALL ON FUNCTION public.read_financial_capital(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_financial_capital(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.scope_financial_event_key() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type IN ('CREATE_FINANCIAL_ACCOUNT','TRANSFER_FINANCIAL_FUNDS') THEN
  IF current_user IN ('authenticated','anon') OR coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') IN ('authenticated','anon') THEN RAISE EXCEPTION 'Financial events are server-written' USING ERRCODE='42501'; END IF;
  IF NEW.command_id IS NULL THEN RAISE EXCEPTION 'Financial event requires command key'; END IF;
  IF TG_OP='INSERT' THEN
   NEW.reference:=NEW.reference || jsonb_build_object('financial_command_id',NEW.command_id);
   NEW.command_id:=md5('financial:' || NEW.session_id::text || ':' || NEW.command_id::text)::uuid;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_event_client_guard BEFORE UPDATE ON public.game_events FOR EACH ROW EXECUTE FUNCTION public.scope_financial_event_key();