
-- Table for player annotations/notes on events
CREATE TABLE public.event_annotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.game_events(id) ON DELETE CASCADE,
  author text NOT NULL,
  note_text text NOT NULL,
  visibility text NOT NULL DEFAULT 'public',  -- public / private / leakable
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to event annotations" ON public.event_annotations FOR ALL USING (true) WITH CHECK (true);

-- Table for AI-generated event narratives
CREATE TABLE public.event_narratives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.game_events(id) ON DELETE CASCADE,
  narrative_text text NOT NULL,
  key_quotes text[] DEFAULT '{}',
  epoch_style text NOT NULL DEFAULT 'kroniky',
  version integer NOT NULL DEFAULT 1,
  is_canon boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_narratives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to event narratives" ON public.event_narratives FOR ALL USING (true) WITH CHECK (true);

-- Add structured battle/raid/diplomacy fields to game_events
ALTER TABLE public.game_events
  ADD COLUMN attacker_city_id uuid REFERENCES public.cities(id),
  ADD COLUMN defender_city_id uuid REFERENCES public.cities(id),
  ADD COLUMN armies_involved text[] DEFAULT '{}',
  ADD COLUMN result text,
  ADD COLUMN casualties text,
  ADD COLUMN treaty_type text,
  ADD COLUMN terms_summary text,
  ADD COLUMN devastation_duration integer;

-- Enable realtime for annotations and narratives
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_annotations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_narratives;
