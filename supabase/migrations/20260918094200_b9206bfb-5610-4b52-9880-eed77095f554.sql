ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS export_gross_value numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.realm_resources.export_gross_value IS
  'Canonical export gross value (sum of basket_trade_flows.gross_value where source_player = player). Written only by aggregate-realm-totals.';