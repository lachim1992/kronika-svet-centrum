
-- =====================================================
-- 1) EXTEND DECLARATIONS TABLE
-- =====================================================

ALTER TABLE public.declarations
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'Neutral',
  ADD COLUMN IF NOT EXISTS target_empire_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_city_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_notes text,
  ADD COLUMN IF NOT EXISTS effects jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- 2) EXTEND ENTITY_TRAITS TABLE
-- =====================================================

ALTER TABLE public.entity_traits
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'Event',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 1;

-- =====================================================
-- 3) INDEX FOR FULL-TEXT SEARCH ON DECLARATIONS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_declarations_session ON public.declarations(session_id);
CREATE INDEX IF NOT EXISTS idx_declarations_player ON public.declarations(player_name);
CREATE INDEX IF NOT EXISTS idx_declarations_type ON public.declarations(declaration_type);
CREATE INDEX IF NOT EXISTS idx_declarations_status ON public.declarations(status);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_declarations_fts ON public.declarations
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(original_text, '')));

-- Entity traits indexes
CREATE INDEX IF NOT EXISTS idx_entity_traits_entity ON public.entity_traits(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_traits_source ON public.entity_traits(source_type, source_id);
