ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS tax_rate_domestic numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS tax_rate_market numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS tax_rate_transit numeric NOT NULL DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS tax_rate_extraction numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS tax_rate_poll numeric NOT NULL DEFAULT 0.002,
  ADD COLUMN IF NOT EXISTS last_turn_gdp_domestic numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_gdp_market numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_gdp_transit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_gdp_extraction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_laffer_loss numeric NOT NULL DEFAULT 0;