-- Fix the live 0022 trigger: jsonb -> text[] is not an implicit PostgreSQL cast.
-- A site is rural only if its effective recipe list is nonempty and EVERY recipe is rural.
-- No existing parcels, buildings, ownership or economic state are modified.
CREATE OR REPLACE FUNCTION public.guard_worked_parcel_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p public.tile_parcels;
  v_recipe_keys jsonb;
  v_recipes text[] := ARRAY[]::text[];
  v_rural boolean := false;
BEGIN
  IF NEW.entity_type = 'building' THEN
    SELECT * INTO p FROM public.tile_parcels
      WHERE id = NEW.parcel_id AND session_id = NEW.session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela neexistuje v této hře'; END IF;

    -- Individual buildings may override their template recipes (upgrades, variants).
    SELECT coalesce(cb.effects->'recipe_keys', bt.effects->'recipe_keys')
      INTO v_recipe_keys
      FROM public.city_buildings cb
      LEFT JOIN public.building_templates bt ON bt.id = cb.template_id
      WHERE cb.id = NEW.entity_id AND cb.session_id = NEW.session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Budova neexistuje v této hře'; END IF;

    IF jsonb_typeof(v_recipe_keys) = 'array' THEN
      SELECT coalesce(array_agg(t.key), ARRAY[]::text[]) INTO v_recipes
        FROM jsonb_array_elements_text(v_recipe_keys) AS t(key);
    END IF;

    v_rural := coalesce(
      cardinality(v_recipes) > 0
      AND (SELECT bool_and(k = ANY(ARRAY[
        'harvest_wheat','harvest_barley','herd_cattle','fell_timber',
        'quarry_stone','mine_iron','mine_gold','harvest_grapes',
        'catch_fish','harvest_rice','cut_peat'
      ]::text[])) FROM unnest(v_recipes) AS r(k)),
      false
    );

    IF v_rural THEN
      IF p.claim_kind IS DISTINCT FROM 'worked' OR p.status <> 'claimed' THEN
        RAISE EXCEPTION 'Venkovská těžební stavba vyžaduje využívanou parcelu';
      END IF;
      IF EXISTS (SELECT 1 FROM public.tile_parcel_contents
        WHERE parcel_id = NEW.parcel_id AND id IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'Využívaná parcela má jen jednu venkovskou stavbu';
      END IF;
    ELSIF p.claim_kind = 'worked' THEN
      RAISE EXCEPTION 'Využívaná parcela nepovoluje městské ani kombinované výrobní recepty';
    END IF;
  ELSIF NEW.entity_type = 'district' AND EXISTS (
    SELECT 1 FROM public.tile_parcels
      WHERE id = NEW.parcel_id AND session_id = NEW.session_id AND claim_kind = 'worked'
  ) THEN
    RAISE EXCEPTION 'Čtvrť nepatří na využívanou parcelu';
  END IF;
  RETURN NEW;
END $$;