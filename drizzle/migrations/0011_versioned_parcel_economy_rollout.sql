ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS parcel_economy_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.parcel_economy_rollouts (
 session_id uuid NOT NULL REFERENCES public.game_sessions(id), version integer NOT NULL,
 snapshot jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,version)
);
GRANT ALL ON public.parcel_economy_rollouts TO service_role;
ALTER TABLE public.parcel_economy_rollouts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.apply_parcel_economy_rollout(p_session uuid,p_turn integer,p_parcels jsonb,p_seats jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.game_sessions; s jsonb; prior jsonb;
BEGIN
 SELECT * INTO g FROM public.game_sessions WHERE id=p_session FOR UPDATE;
 IF g.id IS NULL OR g.current_turn<>p_turn OR g.resolving_turn IS NOT NULL THEN RAISE EXCEPTION 'Stale or resolving session'; END IF;
 IF g.parcel_economy_version=1 THEN RETURN jsonb_build_object('already_applied',true); END IF;
 IF EXISTS(SELECT 1 FROM public.economy_recompute_locks WHERE session_id=p_session AND locked_at>now()-interval '5 minutes') THEN RAISE EXCEPTION 'Economy refresh running'; END IF;
 prior:=jsonb_build_object('session',to_jsonb(g),'cities',(SELECT jsonb_agg(to_jsonb(c)) FROM public.cities c WHERE session_id=p_session),'parcels',(SELECT jsonb_agg(to_jsonb(p)) FROM public.tile_parcels p WHERE session_id=p_session),'realm_resources',(SELECT jsonb_agg(to_jsonb(r)) FROM public.realm_resources r WHERE session_id=p_session),'buildings',(SELECT jsonb_agg(to_jsonb(b)) FROM public.city_buildings b WHERE session_id=p_session));
 INSERT INTO public.parcel_economy_rollouts(session_id,version,snapshot) VALUES(p_session,1,prior);
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_parcels) AS x(session_id uuid) WHERE x.session_id IS DISTINCT FROM p_session) THEN RAISE EXCEPTION 'Foreign parcel'; END IF;
 INSERT INTO public.tile_parcels(session_id,grid_x,grid_y,parcel_index,parcel_x,parcel_y,sub_biome,elevation,buildable,build_cost_multiplier,capacity_slots,status,land_use,owner_player,city_id,claimed_turn)
 SELECT session_id,grid_x,grid_y,parcel_index,parcel_x,parcel_y,sub_biome,elevation,buildable,build_cost_multiplier,capacity_slots,status,land_use,owner_player,city_id,claimed_turn
 FROM jsonb_to_recordset(p_parcels) AS x(session_id uuid,grid_x integer,grid_y integer,parcel_index integer,parcel_x integer,parcel_y integer,sub_biome text,elevation numeric,buildable boolean,build_cost_multiplier numeric,capacity_slots integer,status text,land_use text,owner_player text,city_id uuid,claimed_turn integer)
 ON CONFLICT(session_id,grid_x,grid_y,parcel_index) DO NOTHING;
 FOR s IN SELECT value FROM jsonb_array_elements(p_seats) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.cities WHERE id=(s->>'city_id')::uuid AND session_id=p_session AND owner_player=s->>'owner_player') THEN RAISE EXCEPTION 'Foreign seat'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tile_parcels WHERE session_id=p_session AND grid_x=(s->>'grid_x')::int AND grid_y=(s->>'grid_y')::int AND parcel_index=(s->>'parcel_index')::int AND city_id=(s->>'city_id')::uuid) THEN RAISE EXCEPTION 'Missing physical seat'; END IF;
  UPDATE public.cities SET grid_x=coalesce(grid_x,(s->>'grid_x')::int),grid_y=coalesce(grid_y,(s->>'grid_y')::int),founded_parcel_index=coalesce(founded_parcel_index,(s->>'parcel_index')::int) WHERE id=(s->>'city_id')::uuid AND session_id=p_session;
 END LOOP;
 UPDATE public.game_sessions SET parcel_economy_version=1 WHERE id=p_session;
 RETURN jsonb_build_object('applied',true,'snapshot_saved',true);
END $$;
REVOKE ALL ON FUNCTION public.apply_parcel_economy_rollout(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_parcel_economy_rollout(uuid,integer,jsonb,jsonb) TO service_role;