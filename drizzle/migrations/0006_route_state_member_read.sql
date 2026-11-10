GRANT SELECT ON public.route_state TO authenticated;
GRANT SELECT ON public.v_route_with_state TO authenticated;
GRANT ALL ON public.route_state TO service_role;
DROP POLICY IF EXISTS "Session members read route_state" ON public.route_state;
CREATE POLICY "Session members read route_state" ON public.route_state FOR SELECT TO authenticated USING (app_private.is_session_member(session_id));