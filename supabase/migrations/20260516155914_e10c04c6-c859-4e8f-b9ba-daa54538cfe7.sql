ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS legitimacy numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS last_turn_tax_legitimacy_delta numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.realm_resources.legitimacy IS 'Realm-level legitimacy 0-100. Gates effective tax collection via govMod = 0.5 + 0.5*(legit/100). Drifts down when nominal tax rates exceed soft thresholds.';
COMMENT ON COLUMN public.realm_resources.last_turn_tax_legitimacy_delta IS 'Most recent tax-pressure delta applied to legitimacy (negative = decay).';