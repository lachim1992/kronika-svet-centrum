
-- ═══════════════════════════════════════════
-- 1. DIPLOMATIC RELATIONS (multi-dimensional bilateral state)
-- ═══════════════════════════════════════════
CREATE TABLE public.diplomatic_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  -- Multi-dimensional diplomatic state (-100 to +100 each)
  trust SMALLINT NOT NULL DEFAULT 0,
  fear SMALLINT NOT NULL DEFAULT 0,
  grievance SMALLINT NOT NULL DEFAULT 0,
  dependency SMALLINT NOT NULL DEFAULT 0,
  ideological_alignment SMALLINT NOT NULL DEFAULT 0,
  cooperation_score SMALLINT NOT NULL DEFAULT 0,
  betrayal_score SMALLINT NOT NULL DEFAULT 0,
  -- Derived summary (auto-updated)
  overall_disposition SMALLINT NOT NULL DEFAULT 0,
  -- Metadata
  last_updated_turn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, faction_a, faction_b)
);

ALTER TABLE public.diplomatic_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read diplomatic_relations" ON public.diplomatic_relations FOR SELECT USING (true);
CREATE POLICY "Service role manages diplomatic_relations" ON public.diplomatic_relations FOR ALL USING (true);

-- ═══════════════════════════════════════════
-- 2. DIPLOMATIC MEMORY (structured event memory)
-- ═══════════════════════════════════════════
CREATE TABLE public.diplomatic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'neutral',
  -- memory_type values: betrayal, aid, broken_promise, refused_help, 
  -- shared_enemy, cooperation, threat, tribute, war, peace, trade_success, trade_refusal
  detail TEXT NOT NULL DEFAULT '',
  turn_number INTEGER NOT NULL DEFAULT 0,
  importance SMALLINT NOT NULL DEFAULT 1,
  -- Decay: memories fade over time. 0 = permanent, >0 = loses importance per turn
  decay_rate REAL NOT NULL DEFAULT 0.05,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_event_id UUID REFERENCES public.game_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.diplomatic_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read diplomatic_memory" ON public.diplomatic_memory FOR SELECT USING (true);
CREATE POLICY "Service role manages diplomatic_memory" ON public.diplomatic_memory FOR ALL USING (true);

CREATE INDEX idx_diplomatic_memory_session_factions ON public.diplomatic_memory (session_id, faction_a, faction_b);
CREATE INDEX idx_diplomatic_memory_type ON public.diplomatic_memory (session_id, memory_type);

-- ═══════════════════════════════════════════
-- 3. FACTION INTENTS (persistent AI strategic goals)
-- ═══════════════════════════════════════════
CREATE TABLE public.faction_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  faction_name TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  -- intent_type values: seek_ally, isolate_rival, buy_time, threaten_neighbor,
  -- seek_trade, revenge_betrayal, exploit_instability, anti_hegemon_coalition,
  -- consolidate, defend_territory, expand, dominate
  target_faction TEXT,
  priority SMALLINT NOT NULL DEFAULT 1,
  reasoning TEXT,
  created_turn INTEGER NOT NULL DEFAULT 0,
  resolved_turn INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  -- status: active, resolved, abandoned, superseded
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.faction_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read faction_intents" ON public.faction_intents FOR SELECT USING (true);
CREATE POLICY "Service role manages faction_intents" ON public.faction_intents FOR ALL USING (true);

CREATE INDEX idx_faction_intents_active ON public.faction_intents (session_id, faction_name, status) WHERE status = 'active';
