CREATE TABLE public.geology_seeds (session_id uuid PRIMARY KEY, salt text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.geology_seeds TO service_role;
ALTER TABLE public.geology_seeds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.macro_deposits (session_id uuid NOT NULL, grid_x int NOT NULL, grid_y int NOT NULL, deposits jsonb NOT NULL DEFAULT '[]', generated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (session_id, grid_x, grid_y));
GRANT ALL ON public.macro_deposits TO service_role;
ALTER TABLE public.macro_deposits ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.macro_deposits IS 'Hidden ground truth; service_role only. Players see only their macro_surveys.';

CREATE TABLE public.macro_surveys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, player_name text NOT NULL, grid_x int NOT NULL, grid_y int NOT NULL,
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 2), findings jsonb NOT NULL DEFAULT '[]', surveyed_turn int NOT NULL DEFAULT 0, landmark_name text CHECK (landmark_name IS NULL OR char_length(landmark_name) BETWEEN 2 AND 48),
  UNIQUE (session_id, player_name, grid_x, grid_y));
GRANT SELECT ON public.macro_surveys TO authenticated;
GRANT ALL ON public.macro_surveys TO service_role;
ALTER TABLE public.macro_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own surveys" ON public.macro_surveys FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.session_id = macro_surveys.session_id AND gp.user_id = auth.uid() AND gp.player_name = macro_surveys.player_name));

CREATE OR REPLACE FUNCTION public.record_macro_survey(p_session uuid, p_player text, p_x int, p_y int, p_level int, p_findings jsonb, p_cost int, p_turn int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur int; g int;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT level INTO cur FROM macro_surveys WHERE session_id=p_session AND player_name=p_player AND grid_x=p_x AND grid_y=p_y FOR UPDATE;
 IF cur IS NOT NULL AND cur >= p_level THEN RETURN jsonb_build_object('already',true,'level',cur); END IF;
 IF cur IS NULL AND p_level > 1 THEN RAISE EXCEPTION 'Nejdřív proveďte základní průzkum'; END IF;
 SELECT gold_reserve INTO g FROM realm_resources WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
 IF g IS NULL OR g < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', p_cost, coalesce(g,0); END IF;
 UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id=p_session AND player_name=p_player;
 INSERT INTO macro_surveys(session_id,player_name,grid_x,grid_y,level,findings,surveyed_turn) VALUES (p_session,p_player,p_x,p_y,p_level,p_findings,p_turn)
 ON CONFLICT (session_id,player_name,grid_x,grid_y) DO UPDATE SET level=excluded.level, findings=excluded.findings, surveyed_turn=excluded.surveyed_turn;
 RETURN jsonb_build_object('level',p_level,'cost',p_cost);
END $$;

CREATE OR REPLACE FUNCTION public.claim_macro_tile(p_session uuid, p_player text, p_x int, p_y int, p_turn int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h province_hexes; owned int; cost int; g int; prov uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT * INTO h FROM province_hexes WHERE session_id=p_session AND coalesce(grid_x,q)=p_x AND coalesce(grid_y,r)=p_y FOR UPDATE;
 IF h.id IS NULL THEN RAISE EXCEPTION 'Pole neexistuje'; END IF;
 IF h.owner_player = p_player THEN RETURN jsonb_build_object('already',true); END IF;
 IF h.owner_player IS NOT NULL THEN RAISE EXCEPTION 'Pole patří jiné říši'; END IF;
 IF h.is_passable = false OR h.biome_family ~ '(sea|ocean|lake|water)' THEN RAISE EXCEPTION 'Toto pole nelze nárokovat'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macro_surveys WHERE session_id=p_session AND player_name=p_player AND grid_x=p_x AND grid_y=p_y) THEN RAISE EXCEPTION 'Pole nejdřív prozkoumejte'; END IF;
 SELECT province_id INTO prov FROM province_hexes n WHERE n.session_id=p_session AND n.owner_player=p_player
   AND abs(coalesce(n.grid_x,n.q)-p_x)+abs(coalesce(n.grid_y,n.r)-p_y)=1 ORDER BY province_id NULLS LAST LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pole musí sousedit s vaším územím'; END IF;
 SELECT count(*) INTO owned FROM province_hexes WHERE session_id=p_session AND owner_player=p_player;
 cost := 25 + (owned/5)*5;
 SELECT gold_reserve INTO g FROM realm_resources WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
 IF g IS NULL OR g < cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', cost, coalesce(g,0); END IF;
 UPDATE realm_resources SET gold_reserve = gold_reserve - cost WHERE session_id=p_session AND player_name=p_player;
 UPDATE province_hexes SET owner_player=p_player, province_id=coalesce(prov, province_id) WHERE id=h.id;
 RETURN jsonb_build_object('claimed',true,'cost',cost,'province_id',prov);
END $$;

CREATE OR REPLACE FUNCTION public.assign_macro_province(p_session uuid, p_player text, p_x int, p_y int, p_province uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h province_hexes;
BEGIN
 IF EXISTS(SELECT 1 FROM game_sessions WHERE id=p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
 SELECT * INTO h FROM province_hexes WHERE session_id=p_session AND coalesce(grid_x,q)=p_x AND coalesce(grid_y,r)=p_y FOR UPDATE;
 IF h.id IS NULL OR h.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Pole vám nepatří'; END IF;
 IF NOT EXISTS(SELECT 1 FROM provinces WHERE id=p_province AND session_id=p_session AND owner_player=p_player) THEN RAISE EXCEPTION 'Provincie vám nepatří'; END IF;
 IF h.province_id = p_province THEN RETURN jsonb_build_object('already',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM province_hexes n WHERE n.session_id=p_session AND n.province_id=p_province AND n.owner_player=p_player
   AND abs(coalesce(n.grid_x,n.q)-p_x)+abs(coalesce(n.grid_y,n.r)-p_y)=1) THEN RAISE EXCEPTION 'Provincie musí být souvislá — pole nesousedí s provincií'; END IF;
 IF EXISTS(SELECT 1 FROM cities c WHERE c.session_id=p_session AND coalesce(c.grid_x,c.province_q)=p_x AND coalesce(c.grid_y,c.province_r)=p_y) THEN RAISE EXCEPTION 'Pole s městem nelze přesunout do jiné provincie'; END IF;
 UPDATE province_hexes SET province_id=p_province WHERE id=h.id;
 RETURN jsonb_build_object('assigned',true);
END $$;

REVOKE ALL ON FUNCTION public.record_macro_survey(uuid,text,int,int,int,jsonb,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_macro_tile(uuid,text,int,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_macro_province(uuid,text,int,int,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_macro_survey(uuid,text,int,int,int,jsonb,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_macro_tile(uuid,text,int,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_macro_province(uuid,text,int,int,uuid) TO service_role;