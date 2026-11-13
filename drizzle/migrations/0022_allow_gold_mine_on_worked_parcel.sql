-- Keep the rural-site database guard aligned with the implemented gold mining recipe.
-- No parcel, ownership, reserve or turn data is changed.
CREATE OR REPLACE FUNCTION public.guard_worked_parcel_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.tile_parcels; recipes text[]; rural boolean;
BEGIN
 IF NEW.entity_type='building' THEN
  SELECT * INTO p FROM tile_parcels WHERE id=NEW.parcel_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parcela neexistuje'; END IF;
  SELECT effects->'recipe_keys' INTO recipes FROM building_templates WHERE id=(SELECT template_id FROM city_buildings WHERE id=NEW.entity_id);
  SELECT coalesce((SELECT bool_or(k IN ('harvest_wheat','harvest_barley','herd_cattle','fell_timber','quarry_stone','mine_iron','mine_gold','harvest_grapes','catch_fish','harvest_rice','cut_peat')) FROM unnest(coalesce(recipes,array[]::text[])) k),false) INTO rural;
  IF rural THEN
   IF p.claim_kind IS DISTINCT FROM 'worked' OR p.status<>'claimed' THEN RAISE EXCEPTION 'Venkovská těžební stavba vyžaduje volnou využívanou parcelu'; END IF;
   IF EXISTS(SELECT 1 FROM tile_parcel_contents WHERE parcel_id=NEW.parcel_id AND id<>NEW.id) THEN RAISE EXCEPTION 'Využívaná parcela má jen jednu těžební stavbu'; END IF;
  ELSIF p.claim_kind='worked' THEN RAISE EXCEPTION 'Městská stavba nepatří na využívanou parcelu'; END IF;
 ELSIF NEW.entity_type='district' AND EXISTS(SELECT 1 FROM tile_parcels WHERE id=NEW.parcel_id AND claim_kind='worked') THEN
  RAISE EXCEPTION 'Čtvrť nepatří na využívanou parcelu';
 END IF;
 RETURN NEW;
END $$;