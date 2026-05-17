ALTER TABLE public.trade_flows
  ADD COLUMN IF NOT EXISTS source_node_id uuid,
  ADD COLUMN IF NOT EXISTS target_node_id uuid;