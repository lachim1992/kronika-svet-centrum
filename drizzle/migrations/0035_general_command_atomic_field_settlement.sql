CREATE UNIQUE INDEX military_stacks_general_id_unique
  ON public.military_stacks (general_id) WHERE general_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_general_to_stack(p_session uuid, p_actor text, p_stack uuid, p_general uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; target record; capacity integer;
BEGIN
  SELECT id, name, skill INTO g FROM public.generals
    WHERE id = p_general AND session_id = p_session AND player_name = p_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Generál nepatří tvé říši nebo neexistuje'); END IF;
  SELECT id, name, soldiers, general_id INTO target FROM public.military_stacks
    WHERE id = p_stack AND session_id = p_session AND player_name = p_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Armáda nepatří tvé říši nebo neexistuje'); END IF;
  capacity := LEAST(12000, 2000 + ROUND(GREATEST(0, LEAST(100, g.skill)) * 100)::integer);
  IF target.soldiers > capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Armáda má %s mužů, velitel zvládne nejvýš %s', target.soldiers, capacity));
  END IF;
  IF target.general_id = p_general THEN
    RETURN jsonb_build_object('ok', true, 'general_name', g.name, 'stack_name', target.name, 'capacity', capacity, 'unchanged', true);
  END IF;
  UPDATE public.military_stacks SET general_id = NULL
    WHERE session_id = p_session AND general_id = p_general AND id <> p_stack;
  UPDATE public.military_stacks SET general_id = p_general WHERE id = p_stack;
  RETURN jsonb_build_object('ok', true, 'general_name', g.name, 'stack_name', target.name, 'capacity', capacity);
END $$;
REVOKE ALL ON FUNCTION public.assign_general_to_stack(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_general_to_stack(uuid, text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_field_battle(p_battle uuid, p_rev integer, p_patch jsonb, p_stacks jsonb, p_comps jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE battle_row record; matched integer; invalid integer; inconsistent integer;
BEGIN
  SELECT attacker_stack_id, defender_stack_id INTO battle_row FROM public.field_battles
    WHERE id = p_battle AND rev = p_rev AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF jsonb_array_length(p_stacks) <> 2 THEN RAISE EXCEPTION 'Settlement must contain exactly two battle stacks'; END IF;
  SELECT count(*) INTO matched FROM jsonb_to_recordset(p_stacks) AS x(id uuid)
    WHERE x.id IN (battle_row.attacker_stack_id, battle_row.defender_stack_id);
  IF matched <> 2 THEN RAISE EXCEPTION 'Settlement stack set does not match battle'; END IF;
  SELECT count(*) INTO invalid FROM jsonb_to_recordset(p_comps) AS x(id uuid, manpower integer)
    LEFT JOIN public.military_stack_composition c ON c.id = x.id
    WHERE c.id IS NULL OR c.stack_id NOT IN (battle_row.attacker_stack_id, battle_row.defender_stack_id);
  IF invalid <> 0 THEN RAISE EXCEPTION 'Settlement contains foreign composition rows'; END IF;

  UPDATE public.field_battles SET units = p_patch->'units', orders = '[]'::jsonb, ready = '{}'::jsonb,
    last_report = p_patch->'last_report', meta = p_patch->'meta', round = COALESCE((p_patch->>'round')::int, round),
    status = 'finished', finished_at = now(), rev = rev + 1
  WHERE id = p_battle AND rev = p_rev AND status <> 'finished';
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle changed during settlement'; END IF;
  UPDATE public.military_stacks s SET soldiers = x.soldiers, unit_count = x.unit_count, power = x.power, morale = x.morale, is_active = x.is_active
  FROM jsonb_to_recordset(p_stacks) AS x(id uuid, soldiers integer, unit_count integer, power integer, morale integer, is_active boolean)
  WHERE s.id = x.id;
  UPDATE public.military_stack_composition c SET manpower = x.manpower
  FROM jsonb_to_recordset(p_comps) AS x(id uuid, manpower integer) WHERE c.id = x.id;

  SELECT count(*) INTO inconsistent FROM public.military_stacks s
    WHERE s.id IN (battle_row.attacker_stack_id, battle_row.defender_stack_id)
      AND s.soldiers <> COALESCE((SELECT sum(c.manpower) FROM public.military_stack_composition c WHERE c.stack_id = s.id), 0);
  IF inconsistent <> 0 THEN RAISE EXCEPTION 'Settlement composition totals do not match soldiers'; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_field_battle(uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_field_battle(uuid, integer, jsonb, jsonb, jsonb) TO service_role;

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
    'node_projects','hex_population','city_population_ledger','node_migrations') THEN
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
      ('diplomatic_relations','session_id,faction_a,faction_b'),('hex_population','session_id,q,r'),('city_population_ledger','session_id,city_id,turn_number')) THEN RAISE EXCEPTION 'Unsupported upsert: % / %',tbl,w->>'conflict'; END IF;
     SELECT string_agg(format('%I',k),',') INTO conflict_cols FROM unnest(string_to_array(w->>'conflict',',')) k;
     SELECT string_agg(format('%I=EXCLUDED.%I',k,k),',') INTO assignments FROM jsonb_object_keys(row_data) k WHERE k<>ALL(string_to_array(w->'conflict',','));
     EXECUTE format('INSERT INTO public.%I(%s) SELECT %s ON CONFLICT(%s) DO UPDATE SET %s',tbl,cols,vals,conflict_cols,assignments) USING row_data;
    ELSE
     EXECUTE format('INSERT INTO public.%I(%s) SELECT %s',tbl,cols,vals) USING row_data;
    END IF;
   END LOOP;
  ELSE RAISE EXCEPTION 'Unsupported fiscal action'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.apply_turn_write_batch(uuid,jsonb) FROM PUBLIC,anon,authenticated;