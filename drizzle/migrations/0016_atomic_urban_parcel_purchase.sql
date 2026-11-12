-- Atomically purchase a physical microparcel for urban construction.
-- The earlier JS handler changed ownership and only afterwards debited realm balances.
-- A failed debit could leave an unpaid claim. All updates here are one DB transaction.
-- Explicit city + parcel locks serialize competing claims and construction quotes.
CREATE OR REPLACE FUNCTION public.buy_city_parcel(
  p_session uuid, p_city uuid, p_player text, p_parcel uuid, p_turn integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.game_sessions;
  c public.cities;
  p public.tile_parcels;
  tile public.province_hexes;
  treasury public.realm_resources;
  urban_count integer;
  price_gold integer;
  price_production numeric;
  home_x integer; home_y integer; reachable boolean;
  converting boolean;
BEGIN
  SELECT * INTO s FROM public.game_sessions WHERE id=p_session;
  IF s.id IS NULL OR s.init_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Hra není připravena';
  END IF;
  IF s.resolving_turn IS NOT NULL THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF s.current_turn IS DISTINCT FROM p_turn THEN RAISE EXCEPTION 'Neplatné číslo tahu'; END IF;

  SELECT * INTO c FROM public.cities WHERE id=p_city AND session_id=p_session FOR UPDATE;
  IF c.id IS NULL OR c.owner_player IS DISTINCT FROM p_player THEN
    RAISE EXCEPTION 'Město nevlastníš';
  END IF;
  SELECT * INTO p FROM public.tile_parcels WHERE id=p_parcel AND session_id=p_session FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela neexistuje'; END IF;
  IF p.city_id=p_city AND p.owner_player=p_player
    AND p.status IN ('claimed','occupied') AND p.claim_kind IS DISTINCT FROM 'worked' THEN
    RETURN jsonb_build_object('already', true, 'parcelId', p.id);
  END IF;
  converting := (p.claim_kind='worked' AND p.city_id=p_city
                 AND p.owner_player=p_player AND p.status='claimed');
  IF NOT converting AND (p.status<>'wild' OR p.city_id IS NOT NULL OR p.owner_player IS NOT NULL) THEN
    RAISE EXCEPTION 'Pozemek už vlastní někdo jiný';
  END IF;
  IF p.buildable IS NOT TRUE OR p.sub_biome ~ '(water|channel|sea|ocean)' THEN
    RAISE EXCEPTION 'Parcela není stavební';
  END IF;

  SELECT * INTO tile FROM public.province_hexes WHERE session_id=p_session
      AND grid_x=p.grid_x AND grid_y=p.grid_y;
  IF tile.id IS NULL OR tile.is_passable IS FALSE OR tile.biome_family='sea'
    OR (tile.owner_player IS NOT NULL AND tile.owner_player<>p_player) THEN
    RAISE EXCEPTION 'Pole není dostupné nebo ho vlastní cizí říše';
  END IF;
  home_x:=coalesce(c.grid_x,c.province_q); home_y:=coalesce(c.grid_y,c.province_r);
  SELECT (p.grid_x=home_x AND p.grid_y=home_y)
    OR EXISTS (
      SELECT 1 FROM public.tile_parcels u
      WHERE u.session_id=p_session AND u.city_id=p_city AND u.owner_player=p_player
        AND u.claim_kind IS DISTINCT FROM 'worked'
        AND u.status IN ('claimed','occupied')
        AND abs(u.grid_x-p.grid_x)+abs(u.grid_y-p.grid_y)<=1
    ) INTO reachable;
  IF NOT reachable THEN
    RAISE EXCEPTION 'Parcela musí ležet na poli města nebo přímo vedle jeho stavebního území';
  END IF;

  SELECT count(*) INTO urban_count FROM public.tile_parcels
    WHERE session_id=p_session AND city_id=p_city
      AND status IN ('claimed','occupied') AND claim_kind IS DISTINCT FROM 'worked';
  -- Same positive-value formula as parcelClaimCost in _shared/tileParcels.ts.
  price_gold:=round(35::numeric * coalesce(p.build_cost_multiplier,1) *
                    (1::numeric+urban_count * 0.04));
  price_production:=round(25::numeric * coalesce(p.build_cost_multiplier,1) *
                          (1::numeric+urban_count * 0.04));

  SELECT * INTO treasury FROM public.realm_resources
    WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
  IF treasury.id IS NULL THEN RAISE EXCEPTION 'Pokladna říše chybí'; END IF;
  IF coalesce(treasury.gold_reserve,0)<price_gold OR
     coalesce(treasury.production_reserve,0)<price_production THEN
    RAISE EXCEPTION 'Nedostatek zlata nebo stavební produkce: vyžaduje % zlata a % produkce',
      price_gold,price_production;
  END IF;
  UPDATE public.realm_resources
    SET gold_reserve=gold_reserve-price_gold,
        production_reserve=production_reserve-price_production
    WHERE id=treasury.id;
  UPDATE public.tile_parcels
    SET claim_kind='urban',status='claimed',city_id=p_city,owner_player=p_player,
        land_use='open',claimed_turn=p_turn
    WHERE id=p_parcel;
  RETURN jsonb_build_object('claimed',true,'parcelId',p.id,'urban',urban_count+1,
    'converted',converting,'costGold',price_gold,'costProduction',price_production,
    'subBiome',p.sub_biome,'capacitySlots',p.capacity_slots,'elevation',p.elevation);
END $$;

REVOKE ALL ON FUNCTION public.buy_city_parcel(uuid,uuid,text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_city_parcel(uuid,uuid,text,uuid,integer) TO service_role;
