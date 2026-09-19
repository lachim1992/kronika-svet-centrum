DROP POLICY IF EXISTS game_sessions_authenticated_read ON public.game_sessions;
CREATE POLICY game_sessions_member_read
ON public.game_sessions FOR SELECT TO authenticated
USING (app_private.is_session_member(id));