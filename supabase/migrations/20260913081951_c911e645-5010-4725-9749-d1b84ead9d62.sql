ALTER VIEW public.v_route_with_state SET (security_invoker = true);

ALTER TABLE public.games_disciplines ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.games_disciplines TO authenticated;
GRANT ALL ON public.games_disciplines TO service_role;
CREATE POLICY "Authenticated users can view game disciplines"
  ON public.games_disciplines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage game disciplines"
  ON public.games_disciplines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;