CREATE OR REPLACE FUNCTION public.build_subnode_atomic(
  p_session uuid,
  p_player text,
  p_parcel uuid,
  p_city uuid,
  p_province uuid,
  p_turn integer,
  p_name text,
  p_subtype text,
  p_def jsonb,
  p_cost_gold numeric,
  p_cost_production numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.game_sessions;
  p public.tile_parcels;
  tile public.province_hexes;
  c public.cities;
  treasury public.realm_resources;
  used_slots integer;
  new_node_id uuid;
BEGIN
  IF p_cost_gold < 0 OR p_cost_production < 0
    OR p_cost_gold IS NULL OR p_cost_production IS NULL THEN
    RAISE EXCEPTION 'Neplatná cena poduzlu';
  END IF;
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN
    RAISE EXCEPTION 'Chybí serverová definice poduzlu';
  END IF;

  SELECT * INTO s FROM public.game_sessions WHERE id=p_session;
  IF s.id IS NULL OR s.init_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Hra není připravena';
  END IF;
  IF s.resolving_turn IS NOT NULL THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF s.current_turn IS DISTINCT FROM p_turn THEN RAISE EXCEPTION 'Neplatné číslo tahu'; END IF;

  -- This row lock serializes every construction attempt on the parcel. After a
  -- competing transaction finishes, the capacity query below sees its contents.
  SELECT * INTO p FROM public.tile_parcels
    WHERE id=p_parcel AND session_id=p_session FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela neexistuje'; END IF;
  IF p.owner_player IS NOT NULL AND p.owner_player<>p_player THEN
    RAISE EXCEPTION 'Parcelu drží jiná říše';
  END IF;
  IF p.buildable IS NOT TRUE THEN RAISE EXCEPTION 'Na této parcele nelze stavět'; END IF;
  IF p.claim_kind='worked' THEN RAISE EXCEPTION 'Využívanou parcelu nejprve převeď na stavební'; END IF;
  IF p.city_id IS NOT NULL AND p.city_id IS DISTINCT FROM p_city THEN
    RAISE EXCEPTION 'Parcela nepatří k uvedenému městu';
  END IF;

  SELECT * INTO tile FROM public.province_hexes
    WHERE session_id=p_session AND grid_x=p.grid_x AND grid_y=p.grid_y;
  IF tile.id IS NULL OR tile.is_passable IS FALSE
    OR (tile.owner_player IS NOT NULL AND tile.owner_player<>p_player) THEN
    RAISE EXCEPTION 'Pole není dostupné nebo ho vlastní cizí říše';
  END IF;

  IF p_city IS NOT NULL THEN
    SELECT * INTO c FROM public.cities
      WHERE id=p_city AND session_id=p_session FOR SHARE;
    IF c.id IS NULL OR c.owner_player IS DISTINCT FROM p_player THEN
      RAISE EXCEPTION 'Město nevlastníš';
    END IF;
  ELSIF p_def->>'group'='production' THEN
    RAISE EXCEPTION 'Produkční poduzel vyžaduje vlastní město';
  END IF;

  SELECT coalesce(sum(slots_used),0) INTO used_slots
    FROM public.tile_parcel_contents WHERE parcel_id=p_parcel;
  IF used_slots >= p.capacity_slots THEN RAISE EXCEPTION 'Parcela už nemá volnou kapacitu'; END IF;

  SELECT * INTO treasury FROM public.realm_resources
    WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
  IF treasury.id IS NULL THEN RAISE EXCEPTION 'Pokladna říše chybí'; END IF;
  IF coalesce(treasury.gold_reserve,0)<p_cost_gold
    OR coalesce(treasury.production_reserve,0)<p_cost_production THEN
    RAISE EXCEPTION 'Nedostatek zlata nebo stavební produkce';
  END IF;

  INSERT INTO public.province_nodes(
    session_id,province_id,city_id,name,node_type,node_tier,node_subtype,node_class,
    hex_q,hex_r,grid_x,grid_y,parcel_index,controlled_by,built_by,built_turn,biome_at_build,
    production_output,wealth_output,food_value,resource_output,capability_tags,production_role,
    flow_role,fortification_level,is_active,upgrade_level,max_upgrade_level
  ) VALUES (
    p_session,p_province,p_city,left(coalesce(nullif(p_name,''),p_def->>'label'),80),
    p_def->>'nodeType','micro',p_subtype,'transit',p.grid_x,p.grid_y,p.grid_x,p.grid_y,p.parcel_index,
    p_player,p_player,p_turn,tile.biome_family,
    coalesce((p_def#>>'{resource,production}')::numeric,0),
    coalesce((p_def#>>'{resource,wealth}')::numeric,0),
    coalesce((p_def#>>'{resource,supplies}')::numeric,0),
    coalesce(p_def->'resource','{}'::jsonb),
    (SELECT coalesce(array_agg(value),ARRAY[]::text[])
       FROM jsonb_array_elements_text(coalesce(p_def->'capabilities','[]'::jsonb))),
    p_def->>'role',
    CASE WHEN p_def->>'group'='military' THEN 'regulator' ELSE 'producer' END,
    CASE WHEN p_def->>'group'='military' THEN 1 ELSE 0 END,
    true,1,3
  ) RETURNING id INTO new_node_id;

  INSERT INTO public.tile_parcel_contents(session_id,parcel_id,entity_type,entity_id,slots_used)
    VALUES(p_session,p_parcel,'node',new_node_id,1);
  UPDATE public.tile_parcels SET status='occupied',owner_player=p_player,
    land_use=CASE p_def->>'group' WHEN 'trade' THEN 'commercial' WHEN 'military' THEN 'military' ELSE 'industrial' END
    WHERE id=p_parcel;
  UPDATE public.realm_resources SET gold_reserve=gold_reserve-p_cost_gold,
    production_reserve=production_reserve-p_cost_production WHERE id=treasury.id;

  RETURN jsonb_build_object('nodeId',new_node_id,'costGold',p_cost_gold,'costProduction',p_cost_production);
END $$;

REVOKE ALL ON FUNCTION public.build_subnode_atomic(uuid,text,uuid,uuid,uuid,integer,text,text,jsonb,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_subnode_atomic(uuid,text,uuid,uuid,uuid,integer,text,text,jsonb,numeric,numeric) TO service_role;