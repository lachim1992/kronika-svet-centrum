CREATE OR REPLACE FUNCTION public.validate_tile_parcel_content_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_session uuid;
  v_used integer;
BEGIN
  SELECT capacity_slots, session_id INTO v_capacity, v_session
  FROM public.tile_parcels
  WHERE id = NEW.parcel_id
  FOR UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'Parcel not found';
  END IF;
  IF v_session <> NEW.session_id THEN
    RAISE EXCEPTION 'Parcel belongs to another session';
  END IF;

  SELECT COALESCE(sum(slots_used), 0) INTO v_used
  FROM public.tile_parcel_contents
  WHERE parcel_id = NEW.parcel_id AND id IS DISTINCT FROM NEW.id;

  IF v_used + NEW.slots_used > v_capacity THEN
    RAISE EXCEPTION 'Parcel capacity exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tile_parcel_content_capacity
BEFORE INSERT OR UPDATE ON public.tile_parcel_contents
FOR EACH ROW EXECUTE FUNCTION public.validate_tile_parcel_content_capacity();

ALTER TABLE public.province_nodes
  DROP CONSTRAINT province_nodes_session_id_province_id_node_type_hex_q_hex_r_key;

CREATE UNIQUE INDEX province_nodes_subparcel_unique
ON public.province_nodes(session_id, grid_x, grid_y, parcel_index, node_subtype)
WHERE parcel_index IS NOT NULL AND is_active = true;

COMMENT ON INDEX public.province_nodes_subparcel_unique IS 'Allows several subnodes per macro cell while preventing the same subtype from occupying one parcel twice.';