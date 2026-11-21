CREATE FUNCTION public.scope_financial_event_key() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type IN ('CREATE_FINANCIAL_ACCOUNT','TRANSFER_FINANCIAL_FUNDS') AND NEW.command_id IS NOT NULL THEN
  NEW.reference:=NEW.reference || jsonb_build_object('financial_command_id',NEW.command_id);
  NEW.command_id:=md5('financial:' || NEW.session_id::text || ':' || NEW.command_id::text)::uuid;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.scope_financial_event_key() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER financial_event_session_key BEFORE INSERT ON public.game_events FOR EACH ROW EXECUTE FUNCTION public.scope_financial_event_key();