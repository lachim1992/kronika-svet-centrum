ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS resolving_turn integer;
ALTER TABLE public.turn_execution_guards ADD COLUMN IF NOT EXISTS execution_token uuid;
ALTER TABLE public.turn_execution_guards ADD COLUMN IF NOT EXISTS resumable boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.turn_phase_journal (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
 turn_number integer NOT NULL, phase text NOT NULL, result jsonb NOT NULL DEFAULT '{}',
 completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,turn_number,phase)
);
ALTER TABLE public.turn_phase_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turn_phase_journal FROM anon,authenticated;
GRANT ALL ON public.turn_phase_journal TO service_role;

CREATE OR REPLACE FUNCTION public.begin_turn_resolution(p_session uuid,p_turn integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.game_sessions; guard public.turn_execution_guards; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO g FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF g.id IS NULL OR g.current_turn<>p_turn THEN RETURN NULL; END IF;
 -- A refresh owns the same exclusion window. Do not race its physical writes.
 IF EXISTS(SELECT 1 FROM economy_recompute_locks WHERE session_id=p_session AND locked_at>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 SELECT * INTO guard FROM turn_execution_guards WHERE session_id=p_session FOR UPDATE;
 IF FOUND THEN
  IF guard.status='running' THEN RETURN NULL; END IF;
  IF guard.status='failed' THEN
   -- Only a journalled economic continuation is automatically resumable.
   -- An uncertain legacy/physical failure must never be silently sealed.
   IF guard.turn_number<>p_turn OR NOT guard.resumable THEN RETURN NULL; END IF;
  ELSIF guard.turn_number>=p_turn THEN RETURN NULL;
  END IF;
 END IF;
 UPDATE game_sessions SET resolving_turn=p_turn+1 WHERE id=p_session;
 INSERT INTO turn_execution_guards(session_id,turn_number,status,execution_token,report,resumable)
 VALUES(p_session,p_turn,'running',token,'{}',true)
 ON CONFLICT(session_id) DO UPDATE SET turn_number=p_turn,status='running',execution_token=token,
 started_at=now(),finished_at=NULL,error=NULL,resumable=true;
 RETURN token;
END $$;

CREATE OR REPLACE FUNCTION public.complete_turn_phase(p_session uuid,p_turn integer,p_token uuid,p_phase text,p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM turn_execution_guards WHERE session_id=p_session AND turn_number=p_turn AND execution_token=p_token AND status='running') THEN RAISE EXCEPTION 'Lost turn ownership'; END IF;
 INSERT INTO turn_phase_journal(session_id,turn_number,phase,result) VALUES(p_session,p_turn,p_phase,p_result)
 ON CONFLICT(session_id,turn_number,phase) DO NOTHING;
 IF p_phase='physical' THEN UPDATE turn_execution_guards SET resumable=true WHERE session_id=p_session; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_atomic_turn_phase(p_session uuid,p_turn integer,p_token uuid,p_phase text,p_result jsonb,p_writes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior jsonb;
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM turn_execution_guards WHERE session_id=p_session AND turn_number=p_turn AND execution_token=p_token AND status='running') THEN RAISE EXCEPTION 'Lost turn ownership'; END IF;
 SELECT result INTO prior FROM turn_phase_journal WHERE session_id=p_session AND turn_number=p_turn AND phase=p_phase;
 IF FOUND THEN RETURN prior; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 PERFORM public.complete_turn_phase(p_session,p_turn,p_token,p_phase,p_result);
 RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION public.apply_atomic_turn_phase(uuid,integer,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_atomic_turn_phase(uuid,integer,uuid,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_turn_resolution(p_session uuid,p_turn integer,p_token uuid,p_report jsonb,p_player text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session AND current_turn=p_turn AND resolving_turn=p_turn+1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Turn changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM turn_execution_guards WHERE session_id=p_session AND turn_number=p_turn AND execution_token=p_token AND status='running') THEN RAISE EXCEPTION 'Lost turn ownership'; END IF;
 IF (SELECT count(*) FROM turn_phase_journal WHERE session_id=p_session AND turn_number=p_turn AND phase IN ('physical','goods','world_layer','fiscal','snapshot'))<>5 THEN RAISE EXCEPTION 'Mandatory phase incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM economy_turn_ledgers WHERE session_id=p_session AND turn_number=p_turn+1 AND committed) THEN RAISE EXCEPTION 'Economic ledger not committed'; END IF;
 UPDATE game_sessions SET current_turn=p_turn+1,resolving_turn=NULL,turn_closed_p1=false,turn_closed_p2=false WHERE id=p_session;
 UPDATE game_players SET turn_closed=false WHERE session_id=p_session;
 INSERT INTO turn_summaries(session_id,turn_number,status,closed_at,closed_by) VALUES(p_session,p_turn,'closed',now(),p_player);
 UPDATE turn_execution_guards SET status='completed',finished_at=now(),report=p_report,error=NULL WHERE session_id=p_session AND execution_token=p_token;
END $$;
REVOKE ALL ON FUNCTION public.begin_turn_resolution(uuid,integer),public.complete_turn_phase(uuid,integer,uuid,text,jsonb),public.finish_turn_resolution(uuid,integer,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_turn_resolution(uuid,integer),public.complete_turn_phase(uuid,integer,uuid,text,jsonb),public.finish_turn_resolution(uuid,integer,uuid,jsonb,text) TO service_role;

-- Reads in the economic pipeline use the pending turn, while players continue to
-- see the last completed calendar turn. Keep the physical and fiscal RPC checks aligned.
DO $$
DECLARE fn regprocedure; definition text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.replace_goods_economy_projection(uuid,integer,jsonb)'::regprocedure,'public.apply_goods_fiscal_turn(uuid,text,integer,jsonb,numeric,numeric)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  IF position('coalesce(resolving_turn,current_turn)=p_turn' IN definition)>0 THEN CONTINUE; END IF;
  IF position('current_turn=p_turn' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected economy RPC definition: %',fn; END IF;
  EXECUTE replace(definition,'current_turn=p_turn','coalesce(resolving_turn,current_turn)=p_turn');
 END LOOP;
END $$;
