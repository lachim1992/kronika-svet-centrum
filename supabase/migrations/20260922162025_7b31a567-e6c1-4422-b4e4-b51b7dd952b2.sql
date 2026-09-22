-- Physics emits this field for every faction pair; the missing column aborted world ticks.
ALTER TABLE public.civ_tensions ADD COLUMN IF NOT EXISTS prestige_reduction numeric NOT NULL DEFAULT 0;

-- Preserve the failing phase instead of returning the only diagnostic to the browser.
ALTER TABLE public.turn_execution_guards ADD COLUMN IF NOT EXISTS report jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.turn_execution_guards DROP CONSTRAINT IF EXISTS turn_execution_guards_status_check;
ALTER TABLE public.turn_execution_guards ADD CONSTRAINT turn_execution_guards_status_check
  CHECK (status IN ('running','completed','failed','reconciled'));

CREATE OR REPLACE FUNCTION public.acquire_turn_execution(p_session uuid, p_turn integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_turn_value integer; previous_guard public.turn_execution_guards;
BEGIN
  SELECT current_turn INTO current_turn_value FROM game_sessions WHERE id=p_session FOR UPDATE;
  IF current_turn_value IS NULL OR current_turn_value<>p_turn THEN RETURN false; END IF;
  SELECT * INTO previous_guard FROM turn_execution_guards WHERE session_id=p_session FOR UPDATE;
  IF FOUND AND (previous_guard.turn_number>=p_turn OR previous_guard.status IN ('running','failed')) THEN
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

-- Only generated, active nodes whose rated base never reached the capacity column.
UPDATE public.province_nodes SET production_output=production_base
WHERE production_output=0 AND production_base>0 AND built_by IS NULL AND is_active IS NOT FALSE;

NOTIFY pgrst, 'reload schema';