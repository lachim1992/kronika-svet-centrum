DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['server_config','economy_overrides'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='ALL'
      AND qual='app_private.is_session_member(session_id)' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_member_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.is_session_member(session_id))', t||'_member_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (app_private.is_session_member(session_id) AND public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (app_private.is_session_member(session_id) AND public.has_role(auth.uid(), ''admin''::public.app_role))', t||'_admin_write', t);
  END LOOP;
END $$;