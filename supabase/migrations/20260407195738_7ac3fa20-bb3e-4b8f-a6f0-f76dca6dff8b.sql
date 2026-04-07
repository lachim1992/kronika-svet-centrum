ALTER TABLE public.realm_resources 
  ADD COLUMN IF NOT EXISTS wealth_pop_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_domestic_market numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_route_commerce numeric DEFAULT 0;