CREATE OR REPLACE FUNCTION public.acquire_turn_execution(p_session uuid, p_turn integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_turn_value integer;
  previous_guard public.turn_execution_guards;
BEGIN
  SELECT current_turn
  INTO current_turn_value
  FROM public.game_sessions
  WHERE id = p_session
  FOR UPDATE;

  IF current_turn_value IS NULL OR current_turn_value <> p_turn THEN
    RETURN false;
  END IF;

  SELECT *
  INTO previous_guard
  FROM public.turn_execution_guards
  WHERE session_id = p_session
  FOR UPDATE;

  IF FOUND AND previous_guard.turn_number >= p_turn THEN
    RETURN false;
  END IF;

  INSERT INTO public.turn_execution_guards(session_id, turn_number, status)
  VALUES (p_session, p_turn, 'running')
  ON CONFLICT (session_id) DO UPDATE
  SET turn_number = EXCLUDED.turn_number,
      status = 'running',
      started_at = now(),
      finished_at = NULL,
      error = NULL;

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.acquire_turn_execution(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_turn_execution(uuid, integer) TO service_role;

UPDATE public.turn_execution_guards AS guard
SET status = 'completed',
    finished_at = COALESCE(guard.finished_at, now()),
    error = NULL
FROM public.game_sessions AS session
WHERE session.id = guard.session_id
  AND guard.turn_number < session.current_turn
  AND guard.status <> 'completed';