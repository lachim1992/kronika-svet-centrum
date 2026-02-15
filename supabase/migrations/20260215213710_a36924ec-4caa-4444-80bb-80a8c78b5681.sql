
-- Add portrait columns to great_persons
ALTER TABLE public.great_persons ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.great_persons ADD COLUMN IF NOT EXISTS image_prompt text;
ALTER TABLE public.great_persons ADD COLUMN IF NOT EXISTS bio text;

-- Create wiki_entries table for the encyclopedia
CREATE TABLE public.wiki_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  entity_type text NOT NULL DEFAULT 'city',
  entity_id uuid,
  entity_name text NOT NULL,
  owner_player text NOT NULL,
  summary text,
  ai_description text,
  image_url text,
  image_prompt text,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wiki_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to wiki entries"
ON public.wiki_entries
FOR ALL
USING (true)
WITH CHECK (true);
