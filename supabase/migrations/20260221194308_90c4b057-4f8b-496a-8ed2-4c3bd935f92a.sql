
-- ═══ SAGA VERSIONS ═══
-- Stores versioned saga texts per entity (player-editable, AI-regeneratable)
CREATE TABLE public.saga_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  saga_text text NOT NULL,
  author_player text NOT NULL DEFAULT 'system',
  source_turn integer NOT NULL DEFAULT 1,
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saga_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to saga versions" ON public.saga_versions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_saga_versions_entity ON public.saga_versions (session_id, entity_type, entity_id);
CREATE UNIQUE INDEX idx_saga_versions_unique ON public.saga_versions (session_id, entity_type, entity_id, version);

-- ═══ ENTITY STATS ═══
-- Key-value stats for any entity (population, income, stability, etc.)
CREATE TABLE public.entity_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  stat_key text NOT NULL,
  stat_value text NOT NULL DEFAULT '0',
  stat_unit text,
  source_turn integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to entity stats" ON public.entity_stats FOR ALL USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX idx_entity_stats_unique ON public.entity_stats (session_id, entity_type, entity_id, stat_key);

-- ═══ ENTITY LINKS ═══
-- Relationships between entities (neighbors, vassals, alliances, trade routes)
CREATE TABLE public.entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  from_entity_type text NOT NULL,
  from_entity_id uuid NOT NULL,
  to_entity_type text NOT NULL,
  to_entity_id uuid NOT NULL,
  link_type text NOT NULL DEFAULT 'related',
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to entity links" ON public.entity_links FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_entity_links_from ON public.entity_links (session_id, from_entity_type, from_entity_id);
CREATE INDEX idx_entity_links_to ON public.entity_links (session_id, to_entity_type, to_entity_id);

-- ═══ CHRONICLE MENTIONS ═══
-- Join table linking chronicle entries to mentioned entities
CREATE TABLE public.chronicle_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.chronicle_entries(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chronicle_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to chronicle mentions" ON public.chronicle_mentions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_chronicle_mentions_entity ON public.chronicle_mentions (session_id, entity_type, entity_id);
CREATE INDEX idx_chronicle_mentions_entry ON public.chronicle_mentions (entry_id);
CREATE UNIQUE INDEX idx_chronicle_mentions_unique ON public.chronicle_mentions (entry_id, entity_type, entity_id);
