-- A process crash must not permit a second request to repeat partial world effects.
CREATE TABLE public.turn_execution_guards (
  session_id uuid PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  status text NOT NULL CHECK(status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text
);
ALTER TABLE public.turn_execution_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turn_execution_guards FROM anon,authenticated;
CREATE FUNCTION public.acquire_turn_execution(p_session uuid,p_turn integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_turn_value integer; previous_guard turn_execution_guards; BEGIN
  SELECT current_turn INTO current_turn_value FROM game_sessions WHERE id=p_session FOR UPDATE;
  IF current_turn_value IS NULL OR current_turn_value<>p_turn THEN RETURN false; END IF;
  SELECT * INTO previous_guard FROM turn_execution_guards WHERE session_id=p_session FOR UPDATE;
  IF FOUND AND (previous_guard.status<>'completed' OR previous_guard.turn_number>=p_turn) THEN RETURN false; END IF;
  INSERT INTO turn_execution_guards(session_id,turn_number,status) VALUES(p_session,p_turn,'running')
    ON CONFLICT(session_id) DO UPDATE SET turn_number=p_turn,status='running',started_at=now(),finished_at=NULL,error=NULL;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.acquire_turn_execution(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_turn_execution(uuid,integer) TO service_role;