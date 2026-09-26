CREATE OR REPLACE FUNCTION public.acquire_turn_execution(p_session uuid, p_turn integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_turn_value integer; previous_guard public.turn_execution_guards;
BEGIN
  SELECT current_turn INTO current_turn_value FROM game_sessions WHERE id=p_session FOR UPDATE;
  IF current_turn_value IS NULL OR current_turn_value<>p_turn THEN RETURN false; END IF;
  SELECT * INTO previous_guard FROM turn_execution_guards WHERE session_id=p_session FOR UPDATE;
  IF FOUND AND previous_guard.status IN ('running','failed') THEN RETURN false; END IF;
  -- A reconciled guard for the same turn may be retried; completed turns never replay.
  IF FOUND AND (previous_guard.turn_number>p_turn
     OR (previous_guard.turn_number=p_turn AND previous_guard.status<>'reconciled')) THEN
    RETURN false;
  END IF;
  INSERT INTO turn_execution_guards(session_id,turn_number,status)
  VALUES(p_session,p_turn,'running')
  ON CONFLICT(session_id) DO UPDATE SET turn_number=EXCLUDED.turn_number,status='running',
    started_at=now(),finished_at=NULL,error=NULL,report='{}'::jsonb;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.acquire_turn_execution(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_turn_execution(uuid,integer) TO service_role;