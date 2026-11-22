-- Stage 2 regional economy: persisted rural settlements (villages). ADDITIVE, forward-only.
-- A village anchors one owned worked parcel; it owns no population (the macro cell's existing
-- rural pool) and its producers are the rural sites in the same cell (linked by cell, not stored).
CREATE TABLE IF NOT EXISTS public.rural_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  owner_player text NOT NULL,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL REFERENCES public.tile_parcels(id) ON DELETE CASCADE,
  grid_x integer NOT NULL,
  grid_y integer NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  founded_turn integer NOT NULL DEFAULT 0 CHECK (founded_turn >= 0),
  cost_paid numeric NOT NULL DEFAULT 0 CHECK (cost_paid >= 0),
  command_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rural_settlements_one_per_cell UNIQUE (session_id, grid_x, grid_y),
  CONSTRAINT rural_settlements_one_per_parcel UNIQUE (parcel_id),
  CONSTRAINT rural_settlements_command_unique UNIQUE (session_id, command_id)
);
CREATE INDEX IF NOT EXISTS rural_settlements_city_idx ON public.rural_settlements (session_id, city_id);
CREATE INDEX IF NOT EXISTS rural_settlements_owner_idx ON public.rural_settlements (session_id, owner_player);
GRANT SELECT ON public.rural_settlements TO authenticated;
GRANT ALL ON public.rural_settlements TO service_role;
ALTER TABLE public.rural_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read rural settlements" ON public.rural_settlements FOR SELECT TO authenticated
  USING (app_private.is_session_member(session_id, auth.uid()));

-- Atomic founding: one function = one transaction; debit and insert commit or roll back together.
-- Idempotent by (session, command_id), bound to the same player and parcel.
CREATE OR REPLACE FUNCTION public.create_rural_settlement(p_session uuid, p_command text, p_player text, p_parcel uuid, p_name text, p_cost integer, p_reach integer, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE par record; cty record; prior record; g numeric; new_id uuid; cur integer;
BEGIN
  -- Price and reach are bound to the server constants (ruralSettlement.ts); any other value fails closed.
  IF p_cost IS DISTINCT FROM 20 OR p_reach IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Neplatné parametry vesnice'; END IF;
  IF p_command IS NULL OR length(p_command) = 0 OR p_player IS NULL OR p_parcel IS NULL THEN RAISE EXCEPTION 'Neplatný příkaz'; END IF;
  -- Serialize retries of the same command before any read, so a retry can never debit twice.
  PERFORM pg_advisory_xact_lock(hashtext('rural_settlement_cmd:' || p_session::text || ':' || p_command));
  SELECT * INTO prior FROM rural_settlements WHERE session_id = p_session AND command_id = p_command;
  IF FOUND THEN
    IF prior.owner_player IS DISTINCT FROM p_player OR prior.parcel_id IS DISTINCT FROM p_parcel THEN RAISE EXCEPTION 'Příkaz patří jinému záznamu'; END IF;
    RETURN jsonb_build_object('id', prior.id, 'cost', prior.cost_paid, 'duplicate', true);
  END IF;
  SELECT current_turn INTO cur FROM game_sessions WHERE id = p_session FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hra neexistuje'; END IF;
  IF p_turn IS NULL OR p_turn < 0 OR p_turn IS DISTINCT FROM cur THEN RAISE EXCEPTION 'Tah neodpovídá aktuálnímu tahu serveru'; END IF;
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  SELECT id, grid_x, grid_y, city_id, owner_player, claim_kind INTO par FROM tile_parcels WHERE id = p_parcel AND session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Políčko neexistuje'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rural_settlement:' || p_session::text || ':' || par.grid_x || ',' || par.grid_y));
  IF par.owner_player IS DISTINCT FROM p_player OR par.claim_kind IS DISTINCT FROM 'worked' THEN RAISE EXCEPTION 'Vesnici lze založit jen na vlastní obdělávané parcele'; END IF;
  SELECT id, owner_player, grid_x, grid_y INTO cty FROM cities WHERE id = par.city_id AND session_id = p_session;
  IF NOT FOUND OR cty.owner_player IS DISTINCT FROM p_player THEN RAISE EXCEPTION 'Město ti nepatří'; END IF;
  IF cty.grid_x IS NULL OR cty.grid_y IS NULL OR greatest(abs(par.grid_x - cty.grid_x), abs(par.grid_y - cty.grid_y)) > p_reach THEN RAISE EXCEPTION 'Vesnice je příliš daleko od města'; END IF;
  IF EXISTS (SELECT 1 FROM rural_settlements WHERE session_id = p_session AND ((grid_x = par.grid_x AND grid_y = par.grid_y) OR parcel_id = p_parcel)) THEN RAISE EXCEPTION 'V tomto poli už vesnice stojí'; END IF;
  SELECT gold_reserve INTO g FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
  IF g IS NULL OR g < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', p_cost, coalesce(g, 0); END IF;
  UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id = p_session AND player_name = p_player;
  INSERT INTO rural_settlements (session_id, owner_player, city_id, parcel_id, grid_x, grid_y, name, founded_turn, cost_paid, command_id)
    VALUES (p_session, p_player, cty.id, p_parcel, par.grid_x, par.grid_y, p_name, cur, p_cost, p_command) RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'cost', p_cost, 'duplicate', false);
END $$;
REVOKE ALL ON FUNCTION public.create_rural_settlement(uuid, text, text, uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rural_settlement(uuid, text, text, uuid, text, integer, integer, integer) TO service_role;
