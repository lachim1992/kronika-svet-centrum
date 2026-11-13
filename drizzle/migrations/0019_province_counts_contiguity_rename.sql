CREATE OR REPLACE FUNCTION public.sync_province_hex_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.province_id IS NOT NULL THEN
   UPDATE provinces SET hex_count=(SELECT count(*) FROM province_hexes WHERE province_id=OLD.province_id) WHERE id=OLD.province_id; END IF;
 IF TG_OP IN ('UPDATE','INSERT') AND NEW.province_id IS NOT NULL THEN
   UPDATE provinces SET hex_count=(SELECT count(*) FROM province_hexes WHERE province_id=NEW.province_id) WHERE id=NEW.province_id; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_sync_province_hex_count ON public.province_hexes;
CREATE TRIGGER trg_sync_province_hex_count AFTER INSERT OR DELETE OR UPDATE OF province_id ON public.province_hexes
 FOR EACH ROW EXECUTE FUNCTION public.sync_province_hex_count();
REVOKE ALL ON FUNCTION public.sync_province_hex_count() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_macro_province(p_session uuid, p_player text, p_x int, p_y int, p_province uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h province_hexes; v_left int; v_reach int;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT * INTO h FROM province_hexes WHERE session_id=p_session AND coalesce(grid_x,q)=p_x AND coalesce(grid_y,r)=p_y FOR UPDATE;
 IF h.id IS NULL OR h.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Pole vám nepatří'; END IF;
 IF NOT EXISTS(SELECT 1 FROM provinces WHERE id=p_province AND session_id=p_session AND owner_player=p_player) THEN RAISE EXCEPTION 'Provincie vám nepatří'; END IF;
 IF h.province_id = p_province THEN RETURN jsonb_build_object('already',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM province_hexes n WHERE n.session_id=p_session AND n.province_id=p_province AND n.owner_player=p_player
   AND abs(coalesce(n.grid_x,n.q)-p_x)+abs(coalesce(n.grid_y,n.r)-p_y)=1) THEN RAISE EXCEPTION 'Provincie musí být souvislá — pole nesousedí s provincií'; END IF;
 IF EXISTS(SELECT 1 FROM cities c WHERE c.session_id=p_session AND coalesce(c.grid_x,c.province_q)=p_x AND coalesce(c.grid_y,c.province_r)=p_y) THEN RAISE EXCEPTION 'Pole s městem nelze přesunout do jiné provincie'; END IF;
 IF h.province_id IS NOT NULL THEN
   SELECT count(*) INTO v_left FROM province_hexes WHERE session_id=p_session AND province_id=h.province_id AND id<>h.id;
   IF v_left > 0 THEN
     WITH RECURSIVE cells AS (SELECT coalesce(grid_x,q) x, coalesce(grid_y,r) y FROM province_hexes WHERE session_id=p_session AND province_id=h.province_id AND id<>h.id),
     walk AS ((SELECT x,y FROM cells ORDER BY x,y LIMIT 1)
       UNION SELECT c.x,c.y FROM walk w JOIN cells c ON abs(c.x-w.x)+abs(c.y-w.y)=1)
     SELECT count(*) INTO v_reach FROM walk;
     IF v_reach < v_left THEN RAISE EXCEPTION 'Přesun by rozdělil původní provincii na nesouvislé části'; END IF;
   END IF;
 END IF;
 UPDATE province_hexes SET province_id=p_province WHERE id=h.id;
 RETURN jsonb_build_object('assigned',true);
END $$;

CREATE OR REPLACE FUNCTION public.rename_province(p_session uuid, p_player text, p_province uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
 IF char_length(btrim(p_name)) NOT BETWEEN 2 AND 48 THEN RAISE EXCEPTION 'Název musí mít 2–48 znaků'; END IF;
 UPDATE provinces SET name=btrim(p_name) WHERE id=p_province AND session_id=p_session AND owner_player=p_player RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Přejmenovat lze jen vlastní provincii'; END IF;
 RETURN jsonb_build_object('provinceId',v_id,'name',btrim(p_name));
END $$;
REVOKE ALL ON FUNCTION public.rename_province(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_province(uuid,text,uuid,text) TO service_role;