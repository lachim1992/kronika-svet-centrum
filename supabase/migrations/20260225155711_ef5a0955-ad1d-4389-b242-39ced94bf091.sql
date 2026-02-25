
-- Canonical world premise table with versioning
CREATE TABLE public.world_premise (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  seed TEXT,
  epoch_style TEXT NOT NULL DEFAULT 'kroniky',
  cosmology TEXT DEFAULT '',
  narrative_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  economic_bias TEXT DEFAULT 'balanced',
  war_bias TEXT DEFAULT 'neutral',
  lore_bible TEXT DEFAULT '',
  world_vibe TEXT DEFAULT '',
  writing_style TEXT DEFAULT 'narrative',
  constraints TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one active premise per session
CREATE UNIQUE INDEX uq_world_premise_active 
  ON public.world_premise (session_id) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.world_premise ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to world premise"
  ON public.world_premise
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update timestamp
CREATE TRIGGER update_world_premise_updated_at
  BEFORE UPDATE ON public.world_premise
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
