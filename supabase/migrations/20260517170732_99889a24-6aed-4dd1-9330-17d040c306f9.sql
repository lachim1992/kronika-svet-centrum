
CREATE TABLE IF NOT EXISTS public.basket_trade_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  trade_system_id uuid,
  basket_key text NOT NULL,
  source_city_id uuid NOT NULL,
  target_city_id uuid NOT NULL,
  source_player text NOT NULL,
  target_player text NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  gross_value numeric NOT NULL DEFAULT 0,
  tariff_factor numeric NOT NULL DEFAULT 1.0,
  fiscal_capture numeric NOT NULL DEFAULT 0,
  access_level int NOT NULL DEFAULT 1,
  turn_number int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btf_session ON public.basket_trade_flows(session_id);
CREATE INDEX IF NOT EXISTS idx_btf_session_target ON public.basket_trade_flows(session_id, target_city_id);
CREATE INDEX IF NOT EXISTS idx_btf_session_source ON public.basket_trade_flows(session_id, source_city_id);

ALTER TABLE public.basket_trade_flows ENABLE ROW LEVEL SECURITY;

-- Derived runtime: read for everyone in session, no client writes
CREATE POLICY "basket_trade_flows readable to all" ON public.basket_trade_flows
  FOR SELECT USING (true);

ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS total_gdp numeric NOT NULL DEFAULT 0;
