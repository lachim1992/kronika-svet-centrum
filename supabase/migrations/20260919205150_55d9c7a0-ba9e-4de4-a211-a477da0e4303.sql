GRANT ALL ON public.turn_execution_guards TO service_role;
CREATE POLICY deny_direct_player_read
ON public.turn_execution_guards
FOR SELECT TO authenticated
USING (false);