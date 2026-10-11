-- Follow-up security closure (idempotent).
-- 1) Audit log for admin/dev tool writes (service_role only).
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  table_name text NOT NULL,
  action text NOT NULL,
  filters jsonb,
  payload jsonb,
  ok boolean NOT NULL,
  error text,
  rows_affected integer
);
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS admin_audit_log_session_idx ON public.admin_audit_log(session_id, created_at DESC);

-- 2) game_sessions: no direct client UPDATE at all; INSERT limited to creation columns.
DROP POLICY IF EXISTS game_sessions_member_lobby_update ON public.game_sessions;
REVOKE UPDATE ON public.game_sessions FROM authenticated;
REVOKE INSERT ON public.game_sessions FROM authenticated;
GRANT INSERT (room_code, player1_name, max_players, created_by, game_mode, tier, init_status, epoch_style)
  ON public.game_sessions TO authenticated;
DROP POLICY IF EXISTS game_sessions_creator_create ON public.game_sessions;
CREATE POLICY game_sessions_creator_create ON public.game_sessions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND coalesce(init_status, 'lobby') IN ('lobby', 'initializing')
    AND max_players BETWEEN 1 AND 50);

-- 3) Narrow typed RPCs for the remaining legitimate client actions.
CREATE OR REPLACE FUNCTION public.update_session_lobby(p_session uuid, p_epoch_style text DEFAULT NULL, p_max_players integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE s record; n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id, created_by, init_status INTO s FROM public.game_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session' USING ERRCODE = 'P0002'; END IF;
  IF s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'only the session creator or an admin may change lobby settings' USING ERRCODE = '42501';
  END IF;
  IF p_epoch_style IS NOT NULL AND (length(trim(p_epoch_style)) = 0 OR length(p_epoch_style) > 64) THEN
    RAISE EXCEPTION 'invalid epoch_style' USING ERRCODE = '22023';
  END IF;
  IF p_max_players IS NOT NULL THEN
    IF coalesce(s.init_status, 'lobby') <> 'lobby' THEN RAISE EXCEPTION 'max_players can only change in the lobby' USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO n FROM public.game_players WHERE session_id = p_session;
    IF p_max_players < greatest(n, 1) OR p_max_players > 50 THEN RAISE EXCEPTION 'invalid max_players' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE public.game_sessions SET
    epoch_style = coalesce(p_epoch_style, epoch_style),
    max_players = coalesce(p_max_players, max_players)
  WHERE id = p_session;
END $$;

-- Player names are derived from game_players (seat 1/2), never client-supplied.
CREATE OR REPLACE FUNCTION public.sync_session_player_names(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NOT app_private.is_session_member(p_session) THEN RAISE EXCEPTION 'not a session member' USING ERRCODE = '42501'; END IF;
  UPDATE public.game_sessions g SET
    player1_name = coalesce((SELECT player_name FROM public.game_players WHERE session_id = p_session AND player_number = 1 LIMIT 1), g.player1_name),
    player2_name = (SELECT player_name FROM public.game_players WHERE session_id = p_session AND player_number = 2 LIMIT 1)
  WHERE g.id = p_session;
END $$;

-- Lobby world-generation status: creator/admin, lobby <-> generating only.
CREATE OR REPLACE FUNCTION public.set_session_generation_status(p_session uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE s record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id, created_by, init_status INTO s FROM public.game_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session' USING ERRCODE = 'P0002'; END IF;
  IF s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'only the session creator or an admin may start world generation' USING ERRCODE = '42501';
  END IF;
  IF NOT ((coalesce(s.init_status,'lobby') = 'lobby' AND p_status = 'generating')
       OR (s.init_status = 'generating' AND p_status = 'lobby')) THEN
    RAISE EXCEPTION 'invalid init_status transition' USING ERRCODE = '22023';
  END IF;
  UPDATE public.game_sessions SET init_status = p_status WHERE id = p_session;
END $$;

-- Story ending: creator/admin only; winner is the caller's own seat; turn read from the session.
CREATE OR REPLACE FUNCTION public.end_story_session(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE s record; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id, created_by, current_turn, victory_status INTO s FROM public.game_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session' USING ERRCODE = 'P0002'; END IF;
  IF s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'only the session creator or an admin may end the story' USING ERRCODE = '42501';
  END IF;
  IF s.victory_status = 'won' THEN RAISE EXCEPTION 'session already ended' USING ERRCODE = '22023'; END IF;
  SELECT player_name INTO v_name FROM public.game_players WHERE session_id = p_session AND user_id = auth.uid() ORDER BY player_number LIMIT 1;
  IF v_name IS NULL THEN RAISE EXCEPTION 'caller has no seat in this session' USING ERRCODE = '42501'; END IF;
  UPDATE public.game_sessions SET victory_status = 'won', victory_winner = v_name,
    victory_data = jsonb_build_object('type','story','ended_turn', s.current_turn)
  WHERE id = p_session;
  INSERT INTO public.chronicle_entries(session_id, turn_from, turn_to, text, source_type)
  VALUES (p_session, s.current_turn, s.current_turn,
    format('**V roce %s uzavřel %s kapitolu dějin svého světa.** Příběh jeho říše se stává legendou předávanou z generace na generaci.', s.current_turn, v_name),
    'system');
  RETURN jsonb_build_object('winner', v_name, 'ended_turn', s.current_turn);
END $$;

REVOKE ALL ON FUNCTION public.update_session_lobby(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_session_player_names(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_session_generation_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_story_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_session_lobby(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_session_player_names(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_session_generation_status(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_story_session(uuid) TO authenticated, service_role;
