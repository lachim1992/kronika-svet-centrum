REVOKE ALL ON public.financial_accounts,public.financial_commands,public.financial_transfers,public.financial_entries FROM anon,authenticated;
GRANT SELECT ON public.financial_accounts,public.financial_transfers,public.financial_entries TO authenticated;
GRANT ALL ON public.financial_accounts,public.financial_commands,public.financial_transfers,public.financial_entries TO service_role;