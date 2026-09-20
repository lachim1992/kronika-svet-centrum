CREATE OR REPLACE FUNCTION public.update_goods_management_reports(p_session uuid, p_turn integer, p_reports jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE player_key text; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  -- The ledger itself is only rewritten while the turn is still open: a committed turn is history.
  UPDATE economy_turn_ledgers SET result=jsonb_set(result,'{management}',p_reports)
    WHERE session_id=p_session AND turn_number=p_turn AND NOT committed;
  IF NOT EXISTS(SELECT 1 FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn) THEN
    RAISE EXCEPTION 'No goods ledger for this turn';
  END IF;
  -- The report table is a derived read-only view of the projection, so a refresh may republish it.
  DELETE FROM economy_management_reports WHERE session_id=p_session AND turn_number=p_turn;
  FOR player_key IN SELECT jsonb_object_keys(p_reports) LOOP
    INSERT INTO economy_management_reports(session_id,turn_number,player_name,report)
    VALUES(p_session,p_turn,player_key,p_reports->player_key);
  END LOOP;
END $$;