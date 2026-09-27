-- Fiscal side effects and the treasury guard share one transaction. Failed retries
-- cannot apply famine, morale, sports funding or city capital a second time.
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
