CREATE OR REPLACE FUNCTION app_private.is_session_member(_session_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.game_players gp
      WHERE gp.session_id = _session_id
        AND gp.user_id = _user_id
    )
  )
$$;
REVOKE ALL ON FUNCTION app_private.is_session_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_session_member(uuid, uuid) TO authenticated, service_role;