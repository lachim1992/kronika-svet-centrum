DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ '(^|[^.])is_session_member\('
        OR coalesce(with_check, '') ~ '(^|[^.])is_session_member\('
      )
  LOOP
    IF p.qual IS NOT NULL THEN
      p.qual := regexp_replace(p.qual, '(^|[^.])is_session_member\(', '\1app_private.is_session_member(', 'g');
    END IF;
    IF p.with_check IS NOT NULL THEN
      p.with_check := regexp_replace(p.with_check, '(^|[^.])is_session_member\(', '\1app_private.is_session_member(', 'g');
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