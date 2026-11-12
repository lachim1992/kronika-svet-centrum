ALTER TABLE public.tile_parcels ADD COLUMN IF NOT EXISTS claim_kind text;
ALTER TABLE public.tile_parcels ADD COLUMN IF NOT EXISTS region_name text;
ALTER TABLE public.tile_parcels ADD CONSTRAINT tile_parcels_claim_kind_chk CHECK (claim_kind IS NULL OR claim_kind IN ('urban','worked'));
ALTER TABLE public.tile_parcels ADD CONSTRAINT tile_parcels_region_name_chk CHECK (region_name IS NULL OR char_length(region_name) BETWEEN 2 AND 48);
ALTER TABLE public.tile_parcels ADD CONSTRAINT tile_parcels_worked_not_built_chk CHECK (claim_kind IS DISTINCT FROM 'worked' OR (status='claimed' AND building_id IS NULL));
COMMENT ON COLUMN public.tile_parcels.claim_kind IS 'NULL/urban = paid city plot (legacy claimed/occupied rows are urban); worked = free hinterland claim, one per urban plot, not buildable';
CREATE INDEX IF NOT EXISTS tile_parcels_city_kind_idx ON public.tile_parcels(session_id, city_id, claim_kind);

CREATE OR REPLACE FUNCTION public.claim_worked_parcel(p_session uuid, p_city uuid, p_player text, p_parcel uuid, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.cities; p public.tile_parcels; urban int; worked int; seat_x int; seat_y int; ok boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT * INTO c FROM cities WHERE id=p_city AND session_id=p_session FOR UPDATE;
 IF c.id IS NULL OR c.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Toto město vám nepatří'; END IF;
 SELECT * INTO p FROM tile_parcels WHERE id=p_parcel AND session_id=p_session FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela nebyla nalezena'; END IF;
 IF p.city_id=p_city AND p.claim_kind='worked' THEN RETURN jsonb_build_object('already',true); END IF;
 IF p.status<>'wild' OR p.city_id IS NOT NULL OR p.owner_player IS NOT NULL THEN RAISE EXCEPTION 'Parcela už je obsazená'; END IF;
 IF NOT p.buildable OR p.sub_biome ~ '(water|channel|sea|ocean)' THEN RAISE EXCEPTION 'Tuto parcelu nelze využívat'; END IF;
 IF EXISTS(SELECT 1 FROM province_hexes h WHERE h.session_id=p_session AND h.grid_x=p.grid_x AND h.grid_y=p.grid_y
   AND (h.is_passable=false OR h.biome_family='sea' OR (h.owner_player IS NOT NULL AND h.owner_player<>p_player))) THEN
   RAISE EXCEPTION 'Pole je neprůchodné nebo cizí'; END IF;
 seat_x:=coalesce(c.grid_x,c.province_q); seat_y:=coalesce(c.grid_y,c.province_r);
 SELECT (p.grid_x=seat_x AND p.grid_y=seat_y) OR abs(p.grid_x-seat_x)+abs(p.grid_y-seat_y)=1 OR EXISTS(
   SELECT 1 FROM tile_parcels u WHERE u.session_id=p_session AND u.city_id=p_city AND u.status IN ('claimed','occupied')
   AND u.claim_kind IS DISTINCT FROM 'worked' AND abs(u.grid_x-p.grid_x)+abs(u.grid_y-p.grid_y)<=1) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'Parcela musí ležet na poli města nebo na sousedním poli s městskou parcelou'; END IF;
 SELECT count(*) FILTER (WHERE claim_kind IS DISTINCT FROM 'worked'), count(*) FILTER (WHERE claim_kind='worked') INTO urban, worked
   FROM tile_parcels WHERE session_id=p_session AND city_id=p_city AND status IN ('claimed','occupied');
 IF worked>=urban THEN RAISE EXCEPTION 'Žádný volný nárok (% městských / % využívaných)', urban, worked; END IF;
 UPDATE tile_parcels SET status='claimed', claim_kind='worked', city_id=p_city, owner_player=p_player, land_use='open', claimed_turn=p_turn WHERE id=p_parcel;
 RETURN jsonb_build_object('claimed',true,'urban',urban,'worked',worked+1,'remaining',urban-worked-1);
END $$;
REVOKE ALL ON FUNCTION public.claim_worked_parcel(uuid,uuid,text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_worked_parcel(uuid,uuid,text,uuid,integer) TO service_role;