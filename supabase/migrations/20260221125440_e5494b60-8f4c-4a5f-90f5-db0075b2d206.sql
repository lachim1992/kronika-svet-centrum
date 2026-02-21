
-- Create simulation_log table to track simulation runs and prevent overlaps
CREATE TABLE public.simulation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  year_start INTEGER NOT NULL,
  year_end INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'admin', -- 'player' or 'admin'
  triggered_by TEXT NOT NULL DEFAULT 'system',
  events_generated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.simulation_log ENABLE ROW LEVEL SECURITY;

-- Public access (matches existing pattern)
CREATE POLICY "Public access to simulation log"
  ON public.simulation_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
