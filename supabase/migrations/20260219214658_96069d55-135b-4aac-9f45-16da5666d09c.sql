
-- Create countries table (top of hierarchy: Country → Region → Province → City)
CREATE TABLE public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ruler_player TEXT,
  description TEXT,
  ai_description TEXT,
  image_url TEXT,
  image_prompt TEXT,
  tags TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to countries"
  ON public.countries FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add country_id FK to regions
ALTER TABLE public.regions ADD COLUMN country_id UUID REFERENCES public.countries(id);

-- Auto-create wiki entry for countries
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_country()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'country', NEW.id, NEW.name, COALESCE(NEW.ruler_player, ''))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER auto_wiki_country
  AFTER INSERT ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_country();

-- Add updated_at trigger for countries
CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for countries
ALTER PUBLICATION supabase_realtime ADD TABLE public.countries;
