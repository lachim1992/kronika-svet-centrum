DROP VIEW IF EXISTS public.economy_management_reports;

CREATE TABLE public.economy_management_reports (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  player_name text NOT NULL,
  report jsonb NOT NULL,
  PRIMARY KEY(session_id,turn_number,player_name)
);
GRANT SELECT ON public.economy_management_reports TO authenticated;
GRANT ALL ON public.economy_management_reports TO service_role;
ALTER TABLE public.economy_management_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_management_report_read
ON public.economy_management_reports
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_players p
    WHERE p.session_id=economy_management_reports.session_id
      AND p.player_name=economy_management_reports.player_name
      AND p.user_id=auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.read_economy_management(p_session uuid,p_player text,p_turn integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=public
AS $$
  SELECT report
  FROM public.economy_management_reports
  WHERE session_id=p_session
    AND player_name=p_player
    AND turn_number=p_turn
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.read_economy_management(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_economy_management(uuid,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.update_goods_management_reports(p_session uuid,p_turn integer,p_reports jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE player_key text; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  UPDATE economy_turn_ledgers SET result=jsonb_set(result,'{management}',p_reports)
    WHERE session_id=p_session AND turn_number=p_turn AND NOT committed;
  IF NOT FOUND THEN RAISE EXCEPTION 'No uncommitted goods ledger'; END IF;
  DELETE FROM economy_management_reports WHERE session_id=p_session AND turn_number=p_turn;
  FOR player_key IN SELECT jsonb_object_keys(p_reports) LOOP
    INSERT INTO economy_management_reports(session_id,turn_number,player_name,report)
    VALUES(p_session,p_turn,player_key,p_reports->player_key);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.update_goods_management_reports(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_goods_management_reports(uuid,integer,jsonb) TO service_role;