CREATE TABLE public.sieges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  city_id uuid NOT NULL,
  attacker_player text NOT NULL,
  defender_player text NOT NULL,
  attacker_stack_id uuid NOT NULL,
  started_turn integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','captured','lifted')),
  walls jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_resolved_turn integer,
  last_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sieges_one_active_per_city ON public.sieges (session_id, city_id) WHERE status = 'active';
GRANT SELECT ON public.sieges TO authenticated;
GRANT ALL ON public.sieges TO service_role;
ALTER TABLE public.sieges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read sieges" ON public.sieges FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));

CREATE TABLE public.siege_orders (
  seq bigserial PRIMARY KEY,
  siege_id uuid NOT NULL REFERENCES public.sieges(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  turn_number integer NOT NULL,
  side text NOT NULL CHECK (side IN ('attacker','defender')),
  issued_by text NOT NULL,
  unit_key text NOT NULL,
  target jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siege_id, turn_number, unit_key)
);
GRANT SELECT ON public.siege_orders TO authenticated;
GRANT ALL ON public.siege_orders TO service_role;
GRANT USAGE ON SEQUENCE public.siege_orders_seq_seq TO service_role;
ALTER TABLE public.siege_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read siege orders" ON public.siege_orders FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));

-- Atomic, idempotent settlement of one siege turn (called only by commit-turn with service role).
CREATE OR REPLACE FUNCTION public.apply_siege_turn(p_siege uuid, p_turn integer, p_walls jsonb, p_losses jsonb, p_captured boolean, p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s sieges%ROWTYPE; k text; v numeric; st military_stacks%ROWTYPE; ratio numeric;
BEGIN
  SELECT * INTO s FROM sieges WHERE id = p_siege FOR UPDATE;
  IF s.id IS NULL OR s.status <> 'active' THEN RETURN jsonb_build_object('skipped', 'inactive'); END IF;
  IF s.last_resolved_turn IS NOT NULL AND s.last_resolved_turn >= p_turn THEN RETURN jsonb_build_object('skipped', 'already'); END IF;
  FOR k, v IN SELECT key, value::numeric FROM jsonb_each_text(coalesce(p_losses, '{}'::jsonb)) LOOP
    IF k = 'garrison' THEN
      UPDATE cities SET military_garrison = greatest(0, coalesce(military_garrison, 0) - v::int) WHERE id = s.city_id;
    ELSE
      SELECT * INTO st FROM military_stacks WHERE id = k::uuid FOR UPDATE;
      IF st.id IS NULL OR coalesce(st.soldiers, 0) <= 0 THEN CONTINUE; END IF;
      ratio := greatest(0, st.soldiers - v) / st.soldiers::numeric;
      UPDATE military_stack_composition SET manpower = floor(manpower * ratio) WHERE stack_id = st.id;
      UPDATE military_stacks SET soldiers = greatest(0, soldiers - v::int), unit_count = floor(coalesce(unit_count, soldiers) * ratio),
        power = floor(coalesce(power, 0) * ratio), is_active = (soldiers - v::int) > 0 WHERE id = st.id;
    END IF;
  END LOOP;
  UPDATE sieges SET walls = p_walls, last_resolved_turn = p_turn, last_report = p_report,
    status = CASE WHEN p_captured THEN 'captured' ELSE status END WHERE id = s.id;
  IF p_captured THEN
    UPDATE cities SET occupied_by = s.attacker_player, occupation_turn = p_turn, liberation_deadline_turn = p_turn + 3,
      occupation_loyalty = 15, city_stability = greatest(10, round(coalesce(city_stability, 50) * 0.5)) WHERE id = s.city_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.apply_siege_turn(uuid, integer, jsonb, jsonb, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_siege_turn(uuid, integer, jsonb, jsonb, boolean, jsonb) TO service_role;