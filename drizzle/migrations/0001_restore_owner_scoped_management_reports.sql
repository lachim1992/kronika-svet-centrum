-- Live schema drift: a session-member-wide policy replaced the reviewed owner-only read policy,
-- letting any session member read every realm's city accounts. Restore the reviewed rule.
DROP POLICY IF EXISTS economy_management_reports_session_member_access ON public.economy_management_reports;
DROP POLICY IF EXISTS own_management_report_read ON public.economy_management_reports;
CREATE POLICY own_management_report_read
ON public.economy_management_reports
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_players p
    WHERE p.session_id=economy_management_reports.session_id
      AND p.player_name=economy_management_reports.player_name
      AND p.user_id=auth.uid()
  )
);
REVOKE INSERT, UPDATE, DELETE ON public.economy_management_reports FROM authenticated, anon;