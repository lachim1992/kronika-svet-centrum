-- Restore missing atomic parcel occupancy RPC. Does not modify unrelated triggers or live session rows.
-- Source: supabase/reconciliation/0038_atomic_parcel_occupancy.sql
-- This forward-only migration is safe on existing game sessions; it only exposes the missing service-role function.

CREATE OR REPLACE FUNCTION public.occupy_city_parcel_atomic(
  p_session uuid,
  p_player text,
  p_parcel uuid,
  p_kind text,
  p_entity uuid,
  p_land_use text,
  p_worked boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p public.tile_parcels;
  v_session uuid;
  v_owner text;
BEGIN
  IF p_kind NOT IN ('building', 'district') THEN RAISE EXCEPTION 'Neplatný typ obsazení'; END IF;

  SELECT * INTO p FROM public.tile_parcels
    WHERE id = p_parcel AND session_id = p_session FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela neexistuje v této hře'; END IF;
  IF p.owner_player IS NOT NULL AND p.owner_player IS DISTINCT FROM p_player THEN
    RAISE EXCEPTION 'Parcelu drží jiná říše';
  END IF;

  IF p_kind = 'building' THEN
    SELECT cb.session_id, c.owner_player INTO v_session, v_owner
      FROM public.city_buildings cb JOIN public.cities c ON c.id = cb.city_id
      WHERE cb.id = p_entity;
  ELSE
    SELECT cd.session_id, c.owner_player INTO v_session, v_owner
      FROM public.city_districts cd JOIN public.cities c ON c.id = cd.city_id
      WHERE cd.id = p_entity;
  END IF;
  IF v_session IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'Objekt neexistuje v této hře'; END IF;
  IF v_owner IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Objekt patří jiné říši'; END IF;

  IF EXISTS (SELECT 1 FROM public.tile_parcel_contents
    WHERE session_id = p_session AND parcel_id = p_parcel
      AND entity_type = p_kind AND entity_id = p_entity) THEN
    RETURN jsonb_build_object('already', true, 'parcelId', p_parcel);
  END IF;

  IF p_worked THEN
    IF p_kind <> 'building' OR p.claim_kind IS DISTINCT FROM 'worked' OR p.status <> 'claimed' THEN
      RAISE EXCEPTION 'Venkovská stavba vyžaduje využívanou parcelu';
    END IF;
  ELSE
    IF p.claim_kind = 'worked' THEN RAISE EXCEPTION 'Městský objekt nepatří na využívanou parcelu'; END IF;
    IF p.status NOT IN ('claimed', 'occupied') THEN RAISE EXCEPTION 'Parcela není držena městem'; END IF;
    UPDATE public.tile_parcels SET status = 'occupied', land_use = p_land_use,
      building_id = CASE WHEN p_kind = 'building' THEN p_entity ELSE building_id END,
      district_id = CASE WHEN p_kind = 'district' THEN p_entity ELSE district_id END
      WHERE id = p_parcel;
  END IF;

  IF p_kind = 'building' THEN
    UPDATE public.city_buildings SET parcel_id = p_parcel WHERE id = p_entity;
  ELSE
    UPDATE public.city_districts SET parcel_id = p_parcel WHERE id = p_entity;
  END IF;

  INSERT INTO public.tile_parcel_contents(session_id, parcel_id, entity_type, entity_id, slots_used)
    VALUES (p_session, p_parcel, p_kind, p_entity, 1);
  RETURN jsonb_build_object('occupied', true, 'parcelId', p_parcel);
END $$;

REVOKE ALL ON FUNCTION public.occupy_city_parcel_atomic(uuid,text,uuid,text,uuid,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.occupy_city_parcel_atomic(uuid,text,uuid,text,uuid,text,boolean)
  TO service_role;
