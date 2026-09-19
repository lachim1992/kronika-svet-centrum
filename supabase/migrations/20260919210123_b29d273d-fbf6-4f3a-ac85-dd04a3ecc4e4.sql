CREATE OR REPLACE FUNCTION public.is_session_member(_session_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.game_players gp
    WHERE gp.session_id = _session_id
      AND gp.user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_session_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_session_member(uuid, uuid) TO authenticated, service_role;

-- Replace all broad client policies on session-scoped game data with one session-membership rule.
DO $$
DECLARE
  t record;
  p record;
  policy_name text;
BEGIN
  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN pg_tables pt ON pt.schemaname = 'public' AND pt.tablename = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'session_id'
      AND c.table_name NOT IN ('game_players')
  LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.table_name
        AND (roles && ARRAY['public','anon','authenticated']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.table_name);
    END LOOP;

    policy_name := left(t.table_name || '_session_member_access', 63);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_session_member(session_id)) WITH CHECK (public.is_session_member(session_id))',
      policy_name, t.table_name
    );
  END LOOP;
END
$$;

-- Sessions must be discoverable to signed-in users for create/join flows, but never mutable by outsiders.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='game_sessions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.game_sessions', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY game_sessions_authenticated_read
ON public.game_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY game_sessions_authenticated_create
ON public.game_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY game_sessions_member_update
ON public.game_sessions FOR UPDATE TO authenticated
USING (public.is_session_member(id)) WITH CHECK (public.is_session_member(id));
CREATE POLICY game_sessions_member_delete
ON public.game_sessions FOR DELETE TO authenticated
USING (public.is_session_member(id));

-- A player seat can only be created or modified for the signed-in account.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='game_players' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.game_players', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY game_players_session_read
ON public.game_players FOR SELECT TO authenticated
USING (public.is_session_member(session_id) OR user_id = auth.uid());
CREATE POLICY game_players_self_create
ON public.game_players FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY game_players_self_update
ON public.game_players FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY game_players_self_delete
ON public.game_players FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Membership identity links are visible only within the same game.
DROP POLICY IF EXISTS "Authenticated can read game memberships" ON public.game_memberships;
CREATE POLICY game_memberships_same_session_read
ON public.game_memberships FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_session_member(session_id));

-- Event child tables inherit access from their event's session.
DO $$
DECLARE table_name text; p record; policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['event_annotations','event_entity_links','event_narratives','event_responses']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=table_name LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, table_name);
    END LOOP;
    policy_name := left(table_name || '_event_session_access', 63);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.game_events e WHERE e.id = event_id AND public.is_session_member(e.session_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.game_events e WHERE e.id = event_id AND public.is_session_member(e.session_id)))',
      policy_name, table_name
    );
  END LOOP;
END
$$;

-- Stack composition inherits access from its parent army.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='military_stack_composition' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.military_stack_composition', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY military_stack_composition_session_access
ON public.military_stack_composition FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.military_stacks s
  WHERE s.id = stack_id AND public.is_session_member(s.session_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.military_stacks s
  WHERE s.id = stack_id AND public.is_session_member(s.session_id)
));