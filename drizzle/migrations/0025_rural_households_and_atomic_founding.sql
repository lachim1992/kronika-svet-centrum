-- Rural household accounts and atomic founding settlement transfer.
-- Founding consumes existing rural residents in the same owned province; it never mints people.
CREATE TABLE IF NOT EXISTS public.city_founding_transfers (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  city_id uuid UNIQUE REFERENCES public.cities(id) ON DELETE CASCADE,
  owner_player text NOT NULL,
  request_hash text NOT NULL,
  turn_number integer NOT NULL,
  settlers integer NOT NULL CHECK (settlers > 0),
  source_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, command_id)
);
ALTER TABLE public.city_founding_transfers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.found_city_with_rural_settlers(
  p_session_id uuid,
  p_command_id text,
  p_turn_number integer,
  p_owner_player text,
  p_city_name text,
  p_province_id uuid,
  p_province text,
  p_tags text[],
  p_flavor_prompt text,
  p_q integer,
  p_r integer,
  p_founded_parcel_index integer,
  p_settlers integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target public.province_hexes%ROWTYPE;
  v_transfer public.city_founding_transfers%ROWTYPE;
  v_cell record;
  v_city_id uuid;
  v_province_id uuid;
  v_remaining integer;
  v_take integer;
  v_transferred integer := 0;
  v_peasants integer;
  v_burghers integer;
  v_clerics integer;
  v_sources jsonb := '[]'::jsonb;
  v_request_hash text;
BEGIN
  IF p_session_id IS NULL OR nullif(trim(p_command_id), '') IS NULL
     OR nullif(trim(p_owner_player), '') IS NULL OR nullif(trim(p_city_name), '') IS NULL THEN
    RAISE EXCEPTION 'FOUNDING_INVALID_ARGUMENTS';
  END IF;
  IF p_settlers < 1 OR p_settlers > 10000 THEN
    RAISE EXCEPTION 'FOUNDING_INVALID_SETTLER_COUNT';
  END IF;
  v_request_hash := md5(jsonb_build_object('owner_player',p_owner_player,'turn_number',p_turn_number,'city_name',p_city_name,'province_id',p_province_id,'province',p_province,'tags',p_tags,'flavor_prompt',p_flavor_prompt,'q',p_q,'r',p_r,'founded_parcel_index',p_founded_parcel_index,'settlers',p_settlers)::text);

  -- Reserve and lock this command key before touching rural cells. ON CONFLICT waits for a
  -- concurrent identical command; after that transaction commits, the second caller sees its city.
  INSERT INTO public.city_founding_transfers(
    session_id,command_id,owner_player,request_hash,turn_number,settlers,source_cells
  ) VALUES(p_session_id,p_command_id,p_owner_player,v_request_hash,p_turn_number,p_settlers,'[]'::jsonb)
  ON CONFLICT(session_id,command_id) DO NOTHING;
  SELECT * INTO v_transfer
  FROM public.city_founding_transfers
  WHERE session_id = p_session_id AND command_id = p_command_id
  FOR UPDATE;
  IF v_transfer.city_id IS NOT NULL THEN
    IF v_transfer.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'FOUNDING_COMMAND_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'city_id', v_transfer.city_id, 'transferred', v_transfer.settlers,
      'source_cells', v_transfer.source_cells, 'idempotent', true
    );
  END IF;
  IF v_transfer.request_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'FOUNDING_COMMAND_CONFLICT';
  END IF;

  SELECT * INTO v_target
  FROM public.province_hexes
  WHERE session_id = p_session_id AND q = p_q AND r = p_r
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOUNDING_TARGET_HEX_NOT_FOUND'; END IF;
  IF v_target.owner_player IS NOT NULL AND v_target.owner_player IS DISTINCT FROM p_owner_player THEN
    RAISE EXCEPTION 'FOUNDING_TARGET_ENEMY_CONTROLLED';
  END IF;
  IF NOT v_target.is_passable OR v_target.biome_family NOT IN ('plains','hills','forest','swamp') THEN
    RAISE EXCEPTION 'FOUNDING_TARGET_NOT_SETTLEABLE';
  END IF;
  IF p_province_id IS NOT NULL AND v_target.province_id IS NOT NULL
     AND p_province_id <> v_target.province_id THEN
    RAISE EXCEPTION 'FOUNDING_TARGET_PROVINCE_MISMATCH';
  END IF;
  v_province_id := coalesce(v_target.province_id, p_province_id);

  -- Lock source rows in deterministic order. The axial hex distance <= 2 defines the local
  -- founding catchment; foreign, unpassable and other-province cells cannot contribute.
  v_remaining := p_settlers;
  FOR v_cell IN
    SELECT hp.id, hp.q, hp.r, hp.rural_population, hp.mobile_population,
      greatest(abs(ph.q-p_q), abs(ph.r-p_r), abs((ph.q+ph.r)-(p_q+p_r))) AS distance
    FROM public.hex_population hp
    JOIN public.province_hexes ph
      ON ph.session_id = hp.session_id AND ph.q = hp.q AND ph.r = hp.r
    WHERE hp.session_id = p_session_id
      AND ph.owner_player = p_owner_player
      AND ph.is_passable = true
      AND ph.province_id IS NOT DISTINCT FROM v_province_id
      AND greatest(abs(ph.q-p_q), abs(ph.r-p_r), abs((ph.q+ph.r)-(p_q+p_r))) <= 2
      AND hp.rural_population > 0
    ORDER BY distance, hp.q, hp.r
    FOR UPDATE OF hp
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := least(v_remaining, v_cell.rural_population);
    IF v_take <= 0 THEN CONTINUE; END IF;
    UPDATE public.hex_population
    SET rural_population = rural_population - v_take,
        mobile_population = least(greatest(0, rural_population - v_take), greatest(0, mobile_population - least(mobile_population, v_take))),
        updated_at = now()
    WHERE id = v_cell.id;
    v_remaining := v_remaining - v_take;
    v_transferred := v_transferred + v_take;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object(
      'q', v_cell.q, 'r', v_cell.r, 'people', v_take
    ));
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_RURAL_SETTLERS: required %, available %', p_settlers, v_transferred;
  END IF;

  v_peasants := floor(p_settlers * 0.80)::integer;
  v_burghers := floor(p_settlers * 0.15)::integer;
  v_clerics := p_settlers - v_peasants - v_burghers;

  INSERT INTO public.cities (
    session_id, owner_player, name, province_id, province, level, settlement_level,
    tags, founded_round, flavor_prompt, province_q, province_r, grid_x, grid_y,
    founded_parcel_index, population_total, population_peasants, population_burghers,
    population_clerics, population_warriors, city_stability, local_grain_reserve,
    local_granary_capacity
  ) VALUES (
    p_session_id, p_owner_player, trim(p_city_name), v_province_id, coalesce(p_province, ''),
    'Osada', 'HAMLET', nullif(p_tags, ARRAY[]::text[]), p_turn_number,
    nullif(trim(coalesce(p_flavor_prompt, '')), ''), p_q, p_r, p_q, p_r,
    p_founded_parcel_index, p_settlers, v_peasants, v_burghers, v_clerics, 0, 70, 0, 0
  ) RETURNING id INTO v_city_id;

  UPDATE public.city_founding_transfers
  SET city_id = v_city_id, settlers = v_transferred, source_cells = v_sources
  WHERE session_id = p_session_id AND command_id = p_command_id;

  RETURN jsonb_build_object(
    'city_id', v_city_id, 'transferred', v_transferred,
    'source_cells', v_sources, 'idempotent', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.found_city_with_rural_settlers(uuid,text,integer,text,text,uuid,text,text[],text,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.found_city_with_rural_settlers(uuid,text,integer,text,text,uuid,text,text[],text,integer,integer,integer,integer) TO service_role;

COMMENT ON TABLE public.city_founding_transfers IS
  'Idempotency and audit record for atomic founding transfers from local rural population to a new city.';
