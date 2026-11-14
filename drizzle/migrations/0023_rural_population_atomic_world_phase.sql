DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.apply_turn_write_batch(uuid,jsonb)'::regprocedure) INTO definition;
 IF position('''hex_population''' in definition)=0 THEN
   definition := replace(definition, '''node_projects'',''battle_lobbies'')', '''node_projects'',''battle_lobbies'',''hex_population'',''city_population_ledger'',''node_migrations'')');
   definition := replace(definition, '(''diplomatic_relations'',''session_id,faction_a,faction_b''))', '(''diplomatic_relations'',''session_id,faction_a,faction_b''),(''hex_population'',''session_id,q,r''),(''city_population_ledger'',''session_id,city_id,turn_number''))');
   IF position('''hex_population''' in definition)=0 THEN RAISE EXCEPTION 'Atomic batch contract changed'; END IF;
   EXECUTE definition;
 END IF;
END $migration$;
REVOKE ALL ON FUNCTION public.apply_turn_write_batch(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_turn_write_batch(uuid,jsonb) TO service_role;
COMMENT ON TABLE public.hex_population IS 'Canonical rural baseline: commit-turn world atomic phase advances once per active turn; old rows never catch up missed turns. Refresh and shadow tools never overwrite residents.';