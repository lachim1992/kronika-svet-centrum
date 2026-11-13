CREATE OR REPLACE FUNCTION public.guard_worked_parcel_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE kind text; keys jsonb;
BEGIN
 SELECT claim_kind INTO kind FROM tile_parcels WHERE id = NEW.parcel_id;
 IF kind IS DISTINCT FROM 'worked' THEN RETURN NEW; END IF;
 IF NEW.entity_type <> 'building' THEN RAISE EXCEPTION 'Na využívané půdě lze postavit jen venkovskou těžební stavbu'; END IF;
 SELECT coalesce(b.effects->'recipe_keys', t.effects->'recipe_keys') INTO keys FROM city_buildings b LEFT JOIN building_templates t ON t.id = b.template_id WHERE b.id = NEW.entity_id;
 IF keys IS NULL OR jsonb_array_length(keys) = 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(keys) k WHERE k NOT IN
   ('fell_timber','quarry_stone','mine_iron','harvest_wheat','harvest_barley','herd_cattle','harvest_grapes','cut_peat','catch_fish','harvest_rice')) THEN
   RAISE EXCEPTION 'Na využívané půdě lze postavit jen venkovskou těžební stavbu'; END IF;
 IF EXISTS (SELECT 1 FROM tile_parcel_contents c WHERE c.parcel_id = NEW.parcel_id AND c.id IS DISTINCT FROM NEW.id) THEN
   RAISE EXCEPTION 'Na využívané parcele už stojí venkovská stavba'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_worked_parcel_content BEFORE INSERT OR UPDATE ON public.tile_parcel_contents FOR EACH ROW EXECUTE FUNCTION public.guard_worked_parcel_content();
COMMENT ON COLUMN public.tile_parcels.claim_kind IS 'NULL/urban = paid city plot; worked = free hinterland claim (one per urban plot); stays status=claimed, may host one rural extraction site via tile_parcel_contents';