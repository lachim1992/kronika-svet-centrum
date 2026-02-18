
-- Entity contributions with voting/referendum system
CREATE TABLE public.entity_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  entity_type TEXT NOT NULL, -- city, province, region, wonder, person, event
  entity_id UUID NOT NULL,
  author_player TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'lore', -- lore, building, monument, legend, battle_account, cultural_note, rumor
  title TEXT,
  content_text TEXT NOT NULL,
  ai_expanded_text TEXT,
  image_url TEXT,
  image_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, proposed, accepted, rejected
  votes_yes TEXT[] DEFAULT '{}',
  votes_no TEXT[] DEFAULT '{}',
  vote_threshold INTEGER NOT NULL DEFAULT 2, -- number of yes votes needed
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to entity contributions"
ON public.entity_contributions
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_entity_contributions_updated_at
BEFORE UPDATE ON public.entity_contributions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_entity_contributions_session ON public.entity_contributions(session_id);
CREATE INDEX idx_entity_contributions_entity ON public.entity_contributions(entity_type, entity_id);
