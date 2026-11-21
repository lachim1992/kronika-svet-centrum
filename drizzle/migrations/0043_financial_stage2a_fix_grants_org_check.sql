REVOKE ALL ON public.financial_state_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_state_transfers TO authenticated;
GRANT ALL ON public.financial_state_transfers TO service_role;
ALTER TABLE public.financial_accounts DROP CONSTRAINT financial_accounts_organization_kind;
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_organization_kind CHECK ((sector='ORGANIZATION' AND organization_kind IS NOT NULL AND organization_kind IN ('guild','party','religious')) OR (sector IS NOT NULL AND sector<>'ORGANIZATION' AND organization_kind IS NULL));