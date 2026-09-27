CREATE OR REPLACE FUNCTION public.apply_world_layer_plan(p_session uuid,p_turn integer,p_writes jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior jsonb;
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session AND coalesce(resolving_turn,current_turn)=p_turn FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale world layer turn'; END IF;
 SELECT result INTO prior FROM world_layer_tick_guards WHERE session_id=p_session AND turn_number=p_turn;
 IF FOUND THEN RETURN prior; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 INSERT INTO world_layer_tick_guards(session_id,turn_number,result) VALUES(p_session,p_turn,p_result);
 RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION public.apply_world_layer_plan(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_world_layer_plan(uuid,integer,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_economy_refresh_lock(p_session uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.game_sessions;
BEGIN
 SELECT * INTO g FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF g.id IS NULL OR g.resolving_turn IS NOT NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM economy_recompute_locks WHERE session_id=p_session AND locked_at>now()-interval '5 minutes') THEN RETURN false; END IF;
 INSERT INTO economy_recompute_locks(session_id,locked_at,locked_by) VALUES(p_session,now(),'refresh-economy')
 ON CONFLICT(session_id) DO UPDATE SET locked_at=now(),locked_by='refresh-economy';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.acquire_economy_refresh_lock(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_economy_refresh_lock(uuid) TO service_role;
