ALTER TABLE public.city_market_baskets 
  ADD COLUMN IF NOT EXISTS unmet_demand numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cmb_unmet 
  ON public.city_market_baskets(session_id, turn_number, unmet_demand DESC) 
  WHERE unmet_demand > 0;