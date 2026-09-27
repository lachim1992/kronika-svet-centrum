BEGIN;
DO $test$
DECLARE s uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); token uuid; ok boolean; phase text; x numeric;
BEGIN
 INSERT INTO game_sessions(id,room_code,current_turn) VALUES(s,'QA-CLOSURE',1);
 INSERT INTO realm_resources(session_id,player_name,gold_reserve,production_reserve,last_processed_turn) VALUES(s,'QA',100,0,0);
 INSERT INTO cities(id,session_id,owner_player,name,population_total,city_stability) VALUES(c,s,'QA','QA',100,50);
 token:=begin_turn_resolution(s,1);
 IF token IS NULL OR begin_turn_resolution(s,1) IS NOT NULL THEN RAISE EXCEPTION 'Concurrent turn lock broken'; END IF;
 IF acquire_economy_refresh_lock(s) THEN RAISE EXCEPTION 'Refresh overlaps turn'; END IF;
 IF (SELECT current_turn FROM game_sessions WHERE id=s)<>1 THEN RAISE EXCEPTION 'Calendar advanced before commit'; END IF;
 BEGIN
  PERFORM apply_atomic_turn_phase(s,1,token,'world','{}',jsonb_build_array(
   jsonb_build_object('table','cities','action','update','values',jsonb_build_object('city_stability',90),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c))),
   jsonb_build_object('table','cities','action','update','values',jsonb_build_object('invalid_test_column',0),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c)))
  ));
  RAISE EXCEPTION 'Injected projection failure not raised';
 EXCEPTION WHEN undefined_column THEN NULL;
 END;
 IF (SELECT city_stability FROM cities WHERE id=c)<>50 OR EXISTS(SELECT 1 FROM turn_phase_journal WHERE session_id=s) THEN RAISE EXCEPTION 'Partial world projection persisted'; END IF;
 PERFORM apply_atomic_turn_phase(s,1,token,'world','{"done":true}',jsonb_build_array(
  jsonb_build_object('table','cities','action','update','values',jsonb_build_object('city_stability',60),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c)))));
 PERFORM apply_atomic_turn_phase(s,1,token,'world','{}',jsonb_build_array(
  jsonb_build_object('table','cities','action','update','values',jsonb_build_object('city_stability',5),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c)))));
 IF (SELECT city_stability FROM cities WHERE id=c)<>60 THEN RAISE EXCEPTION 'World phase replayed'; END IF;
 INSERT INTO economy_turn_ledgers(session_id,turn_number,result) VALUES(s,2,'{"famous":[]}');
 BEGIN
  PERFORM apply_goods_fiscal_plan(s,'QA',2,'{}',7,0,jsonb_build_array(
   jsonb_build_object('table','cities','action','update','values',jsonb_build_object('city_stability',80),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c))),
   jsonb_build_object('table','cities','action','update','values',jsonb_build_object('invalid_test_column',0),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c)))
  ));
  RAISE EXCEPTION 'Injected fiscal failure not raised';
 EXCEPTION WHEN undefined_column THEN NULL;
 END;
 IF (SELECT gold_reserve FROM realm_resources WHERE session_id=s)<>100 OR (SELECT city_stability FROM cities WHERE id=c)<>60 THEN RAISE EXCEPTION 'Partial fiscal effects persisted'; END IF;
 ok:=apply_goods_fiscal_plan(s,'QA',2,'{}',7,0,jsonb_build_array(
  jsonb_build_object('table','cities','action','update','values',jsonb_build_object('city_stability',80),'filters',jsonb_build_array(jsonb_build_object('column','id','op','eq','value',c)))));
 IF NOT ok OR apply_goods_fiscal_plan(s,'QA',2,'{}',7,0,'[]') THEN RAISE EXCEPTION 'Fiscal replay guard failed'; END IF;
 IF (SELECT gold_reserve FROM realm_resources WHERE session_id=s)<>107 THEN RAISE EXCEPTION 'Fiscal charged twice'; END IF;
 UPDATE turn_execution_guards SET status='failed' WHERE session_id=s;
 token:=begin_turn_resolution(s,1);
 IF token IS NULL THEN RAISE EXCEPTION 'Cannot resume journalled turn'; END IF;
 FOREACH phase IN ARRAY ARRAY['physical','goods','world_layer','fiscal','snapshot'] LOOP
  PERFORM complete_turn_phase(s,1,token,phase,'{}');
 END LOOP;
 PERFORM commit_goods_economy_ledger(s,2);
 PERFORM finish_turn_resolution(s,1,token,'{}','QA');
 IF (SELECT current_turn FROM game_sessions WHERE id=s)<>2 OR (SELECT resolving_turn FROM game_sessions WHERE id=s) IS NOT NULL THEN RAISE EXCEPTION 'Calendar not published'; END IF;
 IF (SELECT count(*) FROM turn_summaries WHERE session_id=s)<>1 THEN RAISE EXCEPTION 'History not unique'; END IF;
END $test$;


ROLLBACK;
