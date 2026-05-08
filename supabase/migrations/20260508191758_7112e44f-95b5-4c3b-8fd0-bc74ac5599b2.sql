
-- Phase 2 + 3 + 5 schema additions

-- 1) neutral_trade_pacts: hráč zaplatí tribut + má cestu → neutrál vstoupí do jeho trade systému
CREATE TABLE IF NOT EXISTS public.neutral_trade_pacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  neutral_node_id uuid NOT NULL,
  player_name text NOT NULL,
  tribute_paid integer NOT NULL DEFAULT 0,
  signed_turn integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, neutral_node_id, player_name)
);

CREATE INDEX IF NOT EXISTS idx_ntp_session ON public.neutral_trade_pacts(session_id);
CREATE INDEX IF NOT EXISTS idx_ntp_node ON public.neutral_trade_pacts(neutral_node_id);

ALTER TABLE public.neutral_trade_pacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read pacts in session" ON public.neutral_trade_pacts
  FOR SELECT USING (true);
CREATE POLICY "Authenticated can write pacts" ON public.neutral_trade_pacts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update pacts" ON public.neutral_trade_pacts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE TRIGGER update_neutral_trade_pacts_updated_at
  BEFORE UPDATE ON public.neutral_trade_pacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) flow_centrality column on province_nodes (Phase 5)
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS flow_centrality numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_nodes_centrality
  ON public.province_nodes(session_id, flow_centrality DESC);
