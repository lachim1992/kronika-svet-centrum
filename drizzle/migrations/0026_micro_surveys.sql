CREATE TABLE public.micro_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  micro_x integer NOT NULL,
  micro_y integer NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  surveyed_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, player_name, micro_x, micro_y)
);
GRANT SELECT ON public.micro_surveys TO authenticated;
GRANT ALL ON public.micro_surveys TO service_role;
ALTER TABLE public.micro_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own micro surveys" ON public.micro_surveys FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.session_id = micro_surveys.session_id AND gp.user_id = auth.uid() AND gp.player_name = micro_surveys.player_name));

CREATE OR REPLACE FUNCTION public.record_micro_survey(p_session uuid, p_player text, p_x integer, p_y integer, p_findings jsonb, p_cost integer, p_turn integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session AND resolving_turn IS NOT NULL) THEN RAISE EXCEPTION 'Probíhá vyhodnocení tahu'; END IF;
  IF EXISTS (SELECT 1 FROM micro_surveys WHERE session_id = p_session AND player_name = p_player AND micro_x = p_x AND micro_y = p_y) THEN
    RETURN jsonb_build_object('already', true);
  END IF;
  SELECT gold_reserve INTO g FROM realm_resources WHERE session_id = p_session AND player_name = p_player FOR UPDATE;
  IF g IS NULL OR g < p_cost THEN RAISE EXCEPTION 'Nedostatek zlata (potřeba %, máte %)', p_cost, coalesce(g, 0); END IF;
  UPDATE realm_resources SET gold_reserve = gold_reserve - p_cost WHERE session_id = p_session AND player_name = p_player;
  INSERT INTO micro_surveys (session_id, player_name, micro_x, micro_y, findings, surveyed_turn)
  VALUES (p_session, p_player, p_x, p_y, p_findings, p_turn);
  RETURN jsonb_build_object('cost', p_cost);
END $$;
REVOKE ALL ON FUNCTION public.record_micro_survey(uuid, text, integer, integer, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_micro_survey(uuid, text, integer, integer, jsonb, integer, integer) TO service_role;