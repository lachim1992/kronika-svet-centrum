DROP POLICY IF EXISTS "Session members can read rural population" ON public.hex_population;
CREATE POLICY "Session members can read rural population" ON public.hex_population FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));
DROP POLICY IF EXISTS "Session members can read the population ledger" ON public.city_population_ledger;
CREATE POLICY "Session members can read the population ledger" ON public.city_population_ledger FOR SELECT TO authenticated USING (app_private.is_session_member(session_id, auth.uid()));