DROP POLICY IF EXISTS game_players_session_read ON public.game_players;
CREATE POLICY game_players_session_read
ON public.game_players FOR SELECT TO authenticated
USING (app_private.is_session_member(session_id) OR user_id = auth.uid());