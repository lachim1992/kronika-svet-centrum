
-- 1) Add kind + style_preset to encyclopedia_images (unified media table)
ALTER TABLE public.encyclopedia_images 
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS style_preset text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS model_meta jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_turn integer;

-- Backfill existing records as 'cover'
UPDATE public.encyclopedia_images SET kind = 'cover' WHERE kind IS NULL OR kind = 'cover';

-- 2) Create game_style_settings for lore bible / prompt rules per game
CREATE TABLE IF NOT EXISTS public.game_style_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  default_style_preset text NOT NULL DEFAULT 'medieval_illumination',
  lore_bible text DEFAULT '',
  prompt_rules text DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);

ALTER TABLE public.game_style_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to game style settings"
  ON public.game_style_settings FOR ALL
  USING (true) WITH CHECK (true);

-- 3) Migrate wiki_entries image_url into encyclopedia_images where missing
INSERT INTO public.encyclopedia_images (session_id, entity_type, entity_id, image_url, image_prompt, is_primary, kind, style_preset, created_by)
SELECT w.session_id, w.entity_type, w.entity_id, w.image_url, w.image_prompt, true, 'cover', 'default', 'wiki-migrate'
FROM public.wiki_entries w
WHERE w.image_url IS NOT NULL 
  AND w.entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.encyclopedia_images ei 
    WHERE ei.session_id = w.session_id 
      AND ei.entity_type = w.entity_type 
      AND ei.entity_id = w.entity_id
      AND ei.is_primary = true
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_encyclopedia_images_entity_kind 
  ON public.encyclopedia_images(session_id, entity_type, entity_id, kind, is_primary);
