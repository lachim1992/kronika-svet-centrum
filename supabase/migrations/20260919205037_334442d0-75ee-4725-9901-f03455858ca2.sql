GRANT ALL ON public.economy_turn_ledgers TO service_role;
GRANT SELECT ON public.city_good_balances, public.city_economic_role_metrics, public.city_hinterland_assignments, public.famous_goods, public.famous_good_history TO authenticated;
GRANT ALL ON public.city_good_balances, public.city_economic_role_metrics, public.city_hinterland_assignments, public.famous_goods, public.famous_good_history TO service_role;

CREATE POLICY deny_direct_player_read
ON public.economy_turn_ledgers
FOR SELECT TO authenticated
USING (false);

CREATE OR REPLACE VIEW public.economy_management_reports
WITH (security_barrier = true)
AS
SELECT l.session_id,
       l.turn_number,
       p.player_name,
       l.result->'management'->p.player_name AS report
FROM public.economy_turn_ledgers l
JOIN public.game_players p ON p.session_id = l.session_id
WHERE p.user_id = auth.uid();

REVOKE ALL ON public.economy_management_reports FROM PUBLIC, anon;
GRANT SELECT ON public.economy_management_reports TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.read_economy_management(p_session uuid,p_player text,p_turn integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=public
AS $$
  SELECT report
  FROM public.economy_management_reports
  WHERE session_id=p_session
    AND player_name=p_player
    AND turn_number=p_turn
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.read_economy_management(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_economy_management(uuid,text,integer) TO authenticated,service_role;