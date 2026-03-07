
CREATE TABLE public.wiki_entry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  version_number integer NOT NULL DEFAULT 1,
  field_changed text NOT NULL DEFAULT 'ai_description',
  old_value text,
  new_value text,
  old_image_url text,
  new_image_url text,
  image_custom_prompt text,
  changed_by text NOT NULL DEFAULT 'system',
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wiki_entry_versions_entry ON public.wiki_entry_versions(wiki_entry_id);
CREATE INDEX idx_wiki_entry_versions_session ON public.wiki_entry_versions(session_id);

ALTER TABLE public.wiki_entry_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wiki versions" ON public.wiki_entry_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert wiki versions" ON public.wiki_entry_versions FOR INSERT TO authenticated WITH CHECK (true);
