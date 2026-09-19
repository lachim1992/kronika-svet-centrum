CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_session_member(_session_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.game_players gp
    WHERE gp.session_id = _session_id
      AND gp.user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION app_private.is_session_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_session_member(uuid, uuid) TO authenticated, service_role;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%public.is_session_member%'
        OR coalesce(with_check, '') LIKE '%public.is_session_member%'
      )
  LOOP
    IF p.qual IS NOT NULL THEN
      p.qual := replace(p.qual, 'public.is_session_member', 'app_private.is_session_member');
    END IF;
    IF p.with_check IS NOT NULL THEN
      p.with_check := replace(p.with_check, 'public.is_session_member', 'app_private.is_session_member');
    END IF;

    IF p.cmd = 'SELECT' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, p.qual);
    ELSIF p.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, p.with_check);
    ELSIF p.cmd = 'UPDATE' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, p.qual, p.with_check);
    ELSIF p.cmd = 'DELETE' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, p.qual);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, p.qual, p.with_check);
    END IF;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.is_session_member(uuid, uuid) FROM authenticated, PUBLIC, anon;