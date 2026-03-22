ALTER TABLE public.trade_routes 
  ADD COLUMN IF NOT EXISTS start_node_id UUID REFERENCES public.province_nodes(id),
  ADD COLUMN IF NOT EXISTS end_node_id UUID REFERENCES public.province_nodes(id),
  ADD COLUMN IF NOT EXISTS gold_per_turn INTEGER DEFAULT 0;