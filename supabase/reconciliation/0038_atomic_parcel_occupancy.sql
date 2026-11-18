-- Forward-only reconciliation candidate. Intentionally NOT applied to production.
-- Canonical occupancy: city_buildings.parcel_id + tile_parcel_contents.
-- tile_parcels.building_id/district_id remain legacy single-entity projections.

CREATE OR REPLACE FUNCTION public.validate_tile_parcel_content_capacity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_capacity integer;
  v_session uuid;
  v_claim_kind text;
  v_used integer;
BEGIN
  IF NEW.slots_used IS NULL OR NEW.slots_used <= 0 THEN
    RAISE EXCEPTION 'Obsazení parcely musí mít kladnou kapacitu';
  END IF;

  -- The parcel row lock serializes competing inserts. The second transaction
  -- rechecks capacity only after the first transaction commits.
  SELECT capacity_slots, session_id, claim_kind
    INTO v_capacity, v_session, v_claim_kind
    FROM public.tile_parcels
    WHERE id = NEW.parcel_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela neexistuje'; END IF;
  IF v_session IS DISTINCT FROM NEW.session_id THEN
    RAISE EXCEPTION 'Parcela patří do jiné hry';
  END IF;

  SELECT COALESCE(sum(slots_used), 0) INTO v_used
    FROM public.tile_parcel_contents
    WHERE parcel_id = NEW.parcel_id AND id IS DISTINCT FROM NEW.id;

  v_capacity := CASE WHEN v_claim_kind = 'worked' THEN 1 ELSE COALESCE(v_capacity, 0) END;
  IF v_used + NEW.slots_used > v_capacity THEN
    RAISE EXCEPTION 'Kapacita parcely byla překročena';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_tile_parcel_content_capacity ON public.tile_parcel_contents;
CREATE TRIGGER validate_tile_parcel_content_capacity
  BEFORE INSERT OR UPDATE OF parcel_id, slots_used, session_id
  ON public.tile_parcel_contents FOR EACH ROW
  EXECUTE FUNCTION public.validate_tile_parcel_content_capacity();

-- Every content row for a building must point at the same parcel as the building.
CREATE OR REPLACE FUNCTION public.guard_city_building_content_link()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_parcel uuid;
  v_session uuid;
BEGIN
  IF NEW.entity_type <> 'building' THEN RETURN NEW; END IF;
  SELECT parcel_id, session_id INTO v_parcel, v_session
    FROM public.city_buildings WHERE id = NEW.entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budova obsazení neexistuje'; END IF;
  IF v_session IS DISTINCT FROM NEW.session_id OR v_parcel IS DISTINCT FROM NEW.parcel_id THEN
    RAISE EXCEPTION 'Budova a obsazení parcely musí odkazovat na stejnou parcelu a hru';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_city_building_content_link ON public.tile_parcel_contents;
CREATE TRIGGER guard_city_building_content_link
  BEFORE INSERT OR UPDATE OF parcel_id, entity_id, session_id
  ON public.tile_parcel_contents FOR EACH ROW
  EXECUTE FUNCTION public.guard_city_building_content_link();

-- Deferred to transaction commit so occupy_city_parcel_atomic can update the
-- building and insert its content in either order. A standalone browser update
-- that creates only one side of the link fails when its transaction commits.
CREATE OR REPLACE FUNCTION public.guard_city_building_parcel_link()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tile_parcel_contents
      WHERE entity_type = 'building' AND entity_id = OLD.id) THEN
      RAISE EXCEPTION 'Budovu s obsazenou parcelou nelze odstranit bez zrušení obsazení';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.parcel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tile_parcel_contents c
    WHERE c.entity_type = 'building' AND c.entity_id = NEW.id
      AND c.session_id = NEW.session_id AND c.parcel_id = NEW.parcel_id
  ) THEN
    RAISE EXCEPTION 'Budova s parcelou vyžaduje odpovídající obsazení parcely';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tile_parcel_contents c
    WHERE c.entity_type = 'building' AND c.entity_id = NEW.id
      AND (c.session_id IS DISTINCT FROM NEW.session_id OR c.parcel_id IS DISTINCT FROM NEW.parcel_id)
  ) THEN
    RAISE EXCEPTION 'Obsazenou budovu nelze přepnout na jinou parcelu nebo hru';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_city_building_parcel_link ON public.city_buildings;
CREATE CONSTRAINT TRIGGER guard_city_building_parcel_link
  AFTER INSERT OR UPDATE OF parcel_id, session_id ON public.city_buildings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.guard_city_building_parcel_link();

DROP TRIGGER IF EXISTS guard_city_building_parcel_link_delete ON public.city_buildings;
CREATE CONSTRAINT TRIGGER guard_city_building_parcel_link_delete
  AFTER DELETE ON public.city_buildings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.guard_city_building_parcel_link();

-- One transaction for the entity link, legacy tile projection and physical
-- content. Capacity and worked-land guards remain independent triggers.
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

COMMENT ON COLUMN public.tile_parcels.building_id IS
  'LEGACY single-building projection; canonical links are city_buildings.parcel_id + tile_parcel_contents.';
COMMENT ON COLUMN public.tile_parcels.district_id IS
  'LEGACY single-district projection; canonical links are city_districts.parcel_id + tile_parcel_contents.';
