-- Create import_sources table for text paste imports
CREATE TABLE public.import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'text',
  title text NOT NULL DEFAULT 'Importovaný zdroj',
  raw_text text NOT NULL,
  parsed_events_count integer DEFAULT 0,
  parsed_chronicles_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to import sources"
  ON public.import_sources FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_import_sources_updated_at
  BEFORE UPDATE ON public.import_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
