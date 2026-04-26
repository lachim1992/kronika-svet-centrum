CREATE TABLE IF NOT EXISTS public.node_blockades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  node_id uuid NOT NULL REFERENCES public.province_nodes(id) ON DELETE CASCADE,
  blocked_by_player text NOT NULL,
  blocked_until_turn int NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_blockades_session_node
  ON public.node_blockades (session_id, node_id);
CREATE INDEX IF NOT EXISTS idx_node_blockades_active
  ON public.node_blockades (session_id, node_id, blocked_until_turn);

ALTER TABLE public.node_blockades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session members read blockades"
  ON public.node_blockades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.session_id = node_blockades.session_id
        AND gp.user_id = auth.uid()
    )
  );

CREATE POLICY "service role manages blockades"
  ON public.node_blockades FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');