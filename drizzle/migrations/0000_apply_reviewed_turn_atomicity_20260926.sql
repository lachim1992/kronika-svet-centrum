-- Applies reviewed migrations 20260926180000_atomic_fiscal_plan, 20260926181000_turn_phase_journal,
-- 20260926182000_world_layer_refresh_lock verbatim and in order (they were never applied live). All statements are idempotent.
CREATE OR REPLACE FUNCTION public.apply_turn_write_batch(p_session uuid,p_writes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w jsonb; f jsonb; row_data jsonb; tbl text; cols text; vals text; assignments text; predicate text; conflict_cols text;
BEGIN
 FOR w IN SELECT * FROM jsonb_array_elements(p_writes) LOOP
  tbl:=w->>'table';
  IF tbl NOT IN ('cities','province_routes','military_stacks','sports_associations','city_factions',
    'province_nodes','game_events','city_capital_stock','world_action_log',
    'route_state','world_events','realm_resources','entity_traits','world_tick_log',
    'civ_influence','civ_tensions','city_states','diplomatic_relations','diplomatic_memory','ai_factions',
    'node_projects','battle_lobbies') THEN
   RAISE EXCEPTION 'Unsupported fiscal table: %',tbl;
  END IF;
  IF w->>'action' IN ('update','delete') THEN
   IF jsonb_array_length(w->'filters')=0 THEN RAISE EXCEPTION 'Unscoped update'; END IF;
   predicate:=format('t.session_id=%L::uuid',p_session);
   FOR f IN SELECT * FROM jsonb_array_elements(w->'filters') LOOP
    IF f->>'op' IN ('eq','is') THEN
     predicate:=predicate||format(' AND coalesce(to_jsonb(t)->%L,''null''::jsonb)=%L::jsonb',f->>'column',f->'value');
    ELSIF f->>'op'='neq' THEN
     predicate:=predicate||format(' AND to_jsonb(t)->%L<>%L::jsonb',f->>'column',f->'value');
    ELSIF f->>'op'='in' THEN
     predicate:=predicate||format(' AND %L::jsonb @> jsonb_build_array(to_jsonb(t)->%L)',f->'value',f->>'column');
    ELSIF f->>'op' IN ('lt','lte','gt','gte') THEN
     predicate:=predicate||format(' AND to_jsonb(t)->%L %s %L::jsonb',f->>'column',
      CASE f->>'op' WHEN 'lt' THEN '<' WHEN 'lte' THEN '<=' WHEN 'gt' THEN '>' ELSE '>=' END,f->'value');
    ELSE RAISE EXCEPTION 'Unsupported filter'; END IF;
   END LOOP;
   IF w->>'action'='delete' THEN
    IF tbl<>'world_events' THEN RAISE EXCEPTION 'Unsupported deletion'; END IF;
    EXECUTE format('DELETE FROM public.%I t WHERE %s',tbl,predicate);
    CONTINUE;
   END IF;
   IF w->'values' ?| array['id','session_id'] THEN RAISE EXCEPTION 'Cannot change identity'; END IF;
   SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',k,tbl,k),',') INTO assignments
    FROM jsonb_object_keys(w->'values') k;
   EXECUTE format('UPDATE public.%I t SET %s WHERE %s',tbl,assignments,predicate) USING w->'values';
  ELSIF w->>'action' IN ('insert','upsert') THEN
   FOR row_data IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w->'values')='array' THEN w->'values' ELSE jsonb_build_array(w->'values') END) LOOP
    IF row_data->>'session_id' IS DISTINCT FROM p_session::text THEN RAISE EXCEPTION 'Foreign session insert'; END IF;
    SELECT string_agg(format('%I',k),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',tbl,k),',') INTO cols,vals
     FROM jsonb_object_keys(row_data) k;
    IF w->>'action'='upsert' THEN
     IF (tbl,w->>'conflict') NOT IN (('city_capital_stock','session_id,city_id'),('route_state','route_id'),
      ('civ_influence','session_id,player_name,turn_number'),('civ_tensions','session_id,player_a,player_b,turn_number'),
      ('diplomatic_relations','session_id,faction_a,faction_b')) THEN RAISE EXCEPTION 'Unsupported upsert: % / %',tbl,w->>'conflict'; END IF;
     SELECT string_agg(format('%I',k),',') INTO conflict_cols FROM unnest(string_to_array(w->>'conflict',',')) k;
     SELECT string_agg(format('%I=EXCLUDED.%I',k,k),',') INTO assignments FROM jsonb_object_keys(row_data) k WHERE k<>ALL(string_to_array(w->>'conflict',','));
     EXECUTE format('INSERT INTO public.%I(%s) SELECT %s ON CONFLICT(%s) DO UPDATE SET %s',tbl,cols,vals,conflict_cols,assignments) USING row_data;
    ELSE
     EXECUTE format('INSERT INTO public.%I(%s) SELECT %s',tbl,cols,vals) USING row_data;
    END IF;
   END LOOP;
  ELSE RAISE EXCEPTION 'Unsupported fiscal action'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.apply_turn_write_batch(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_plan(p_session uuid,p_player text,p_turn integer,p_patch jsonb,p_gold_delta numeric,p_capex_delta numeric,p_writes jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM game_sessions WHERE id=p_session FOR UPDATE;
 IF NOT public.apply_goods_fiscal_turn(p_session,p_player,p_turn,p_patch,p_gold_delta,p_capex_delta) THEN RETURN false; END IF;
 PERFORM public.apply_turn_write_batch(p_session,p_writes);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_goods_fiscal_plan(uuid,text,integer,jsonb,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_goods_fiscal_plan(uuid,text,integer,jsonb,numeric,numeric,jsonb) TO service_role;

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
 IF EXISTS(SELECT 1 FROM economy_recompute_locks WHERE session_id=p_session AND locked_at>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 SELECT * INTO guard FROM turn_execution_guards WHERE session_id=p_session FOR UPDATE;
 IF FOUND THEN
  IF guard.status='running' THEN RETURN NULL; END IF;
  IF guard.status='failed' THEN
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