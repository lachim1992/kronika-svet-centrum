
-- War declarations table
CREATE TABLE public.war_declarations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  declaring_player TEXT NOT NULL,
  target_player TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, peace_offered, peace_accepted, ended
  manifest_text TEXT,
  epic_text TEXT,
  declared_turn INTEGER NOT NULL DEFAULT 1,
  ended_turn INTEGER,
  peace_conditions JSONB DEFAULT '{}',
  peace_offered_by TEXT,
  peace_offer_text TEXT,
  stability_penalty_applied BOOLEAN NOT NULL DEFAULT false,
  diplomatic_effects JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.war_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to war declarations"
ON public.war_declarations FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_war_declarations_updated_at
BEFORE UPDATE ON public.war_declarations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.war_declarations;
