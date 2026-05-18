
CREATE TABLE public.node_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  node_id uuid NOT NULL,
  player_name text NOT NULL,
  target_basket_key text NOT NULL CHECK (target_basket_key IN (
    'staple_food','basic_clothing','tools','fuel','drinking_water',
    'storage_logistics','admin_supplies','construction','metalwork',
    'military_supply','luxury_clothing','feast'
  )),
  target_good_key text,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','prefer','lock')),
  last_status text,
  last_status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, node_id)
);

CREATE INDEX idx_npo_session ON public.node_production_orders(session_id);
CREATE INDEX idx_npo_node ON public.node_production_orders(node_id);

ALTER TABLE public.node_production_orders ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "npo_read_all"
ON public.node_production_orders
FOR SELECT
USING (true);

-- Block all direct mutations from client; only service role (edge function) writes
CREATE POLICY "npo_no_direct_insert"
ON public.node_production_orders
FOR INSERT
WITH CHECK (false);

CREATE POLICY "npo_no_direct_update"
ON public.node_production_orders
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY "npo_no_direct_delete"
ON public.node_production_orders
FOR DELETE
USING (false);

CREATE TRIGGER trg_npo_updated_at
BEFORE UPDATE ON public.node_production_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
