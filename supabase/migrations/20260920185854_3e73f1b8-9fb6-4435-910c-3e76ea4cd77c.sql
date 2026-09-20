CREATE TABLE public.structure_production_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL,
  structure_type text NOT NULL CHECK (structure_type IN ('building','district')),
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','prefer','lock')),
  target_good_key text,
  target_basket_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (session_id, structure_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.structure_production_orders TO authenticated;
GRANT ALL ON public.structure_production_orders TO service_role;
ALTER TABLE public.structure_production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members manage structure production orders"
  ON public.structure_production_orders FOR ALL TO authenticated
  USING (public.is_session_member(session_id, auth.uid()))
  WITH CHECK (public.is_session_member(session_id, auth.uid()));
CREATE TRIGGER update_structure_production_orders_updated_at
  BEFORE UPDATE ON public.structure_production_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_structure_production_orders_session ON public.structure_production_orders(session_id);