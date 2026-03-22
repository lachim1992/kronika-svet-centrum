
-- Function: mark all routes connected to a node as dirty
CREATE OR REPLACE FUNCTION public.mark_routes_dirty_for_node()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE province_routes
  SET path_dirty = true
  WHERE session_id = NEW.session_id
    AND (node_a = NEW.id OR node_b = NEW.id)
    AND (path_dirty IS DISTINCT FROM true);
  RETURN NEW;
END;
$$;

-- Trigger: when province_nodes infrastructure or fortification changes
CREATE TRIGGER trg_infra_dirty_routes
AFTER UPDATE OF infrastructure_level, fortification_level ON public.province_nodes
FOR EACH ROW
WHEN (OLD.infrastructure_level IS DISTINCT FROM NEW.infrastructure_level
   OR OLD.fortification_level IS DISTINCT FROM NEW.fortification_level)
EXECUTE FUNCTION public.mark_routes_dirty_for_node();

-- Function: mark routes dirty when a hex changes (bridge built, passability)
CREATE OR REPLACE FUNCTION public.mark_routes_dirty_for_hex()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Find all nodes on or adjacent to this hex, then dirty their routes
  UPDATE province_routes
  SET path_dirty = true
  WHERE session_id = NEW.session_id
    AND path_dirty IS DISTINCT FROM true
    AND (
      node_a IN (SELECT id FROM province_nodes WHERE session_id = NEW.session_id AND hex_q = NEW.q AND hex_r = NEW.r)
      OR node_b IN (SELECT id FROM province_nodes WHERE session_id = NEW.session_id AND hex_q = NEW.q AND hex_r = NEW.r)
      -- Also dirty routes whose hex_path passes through this hex
      OR id IN (
        SELECT fp.route_id FROM flow_paths fp
        WHERE fp.session_id = NEW.session_id
          AND fp.route_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(fp.hex_path::jsonb) elem
            WHERE (elem->>'q')::int = NEW.q AND (elem->>'r')::int = NEW.r
          )
      )
    );
  RETURN NEW;
END;
$$;

-- Trigger: when hex bridge/passability changes
CREATE TRIGGER trg_hex_dirty_routes
AFTER UPDATE OF has_bridge, is_passable ON public.province_hexes
FOR EACH ROW
WHEN (OLD.has_bridge IS DISTINCT FROM NEW.has_bridge
   OR OLD.is_passable IS DISTINCT FROM NEW.is_passable)
EXECUTE FUNCTION public.mark_routes_dirty_for_hex();

-- Function: mark routes dirty when a building completes (roads, bridges, fortifications)
CREATE OR REPLACE FUNCTION public.mark_routes_dirty_for_building()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_city_node_id uuid;
BEGIN
  -- Only trigger when building status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Check if building is infrastructure-related
    IF NEW.category IN ('infrastructure', 'military', 'fortification')
       OR NEW.name ILIKE '%road%' OR NEW.name ILIKE '%bridge%' OR NEW.name ILIKE '%wall%'
       OR NEW.name ILIKE '%cest%' OR NEW.name ILIKE '%most%' OR NEW.name ILIKE '%hradb%'
       OR NEW.name ILIKE '%fort%' OR NEW.name ILIKE '%gate%' OR NEW.name ILIKE '%brán%'
       OR (NEW.building_tags IS NOT NULL AND NEW.building_tags && ARRAY['infrastructure', 'road', 'bridge', 'fortification', 'gate', 'wall'])
    THEN
      -- Find the node associated with this city
      SELECT id INTO v_city_node_id FROM province_nodes
      WHERE session_id = NEW.session_id AND city_id = NEW.city_id
      LIMIT 1;

      IF v_city_node_id IS NOT NULL THEN
        UPDATE province_routes
        SET path_dirty = true
        WHERE session_id = NEW.session_id
          AND (node_a = v_city_node_id OR node_b = v_city_node_id)
          AND path_dirty IS DISTINCT FROM true;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: when building completes
CREATE TRIGGER trg_building_dirty_routes
AFTER UPDATE OF status ON public.city_buildings
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
EXECUTE FUNCTION public.mark_routes_dirty_for_building();
