
-- Phase 1A: Game Mode Architecture

-- 1) Add game_mode and tier to game_sessions
ALTER TABLE public.game_sessions 
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'tb_multi',
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';

-- 2) Add AI fields to civilizations
ALTER TABLE public.civilizations
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_personality TEXT;

-- 3) Add is_premium to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- 4) Create ai_factions table
CREATE TABLE IF NOT EXISTS public.ai_factions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  faction_name TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT 'diplomatic',
  disposition JSONB NOT NULL DEFAULT '{}',
  goals JSONB NOT NULL DEFAULT '[]',
  resources_snapshot JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_factions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to ai factions"
  ON public.ai_factions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5) Create ai_world_summaries table
CREATE TABLE IF NOT EXISTS public.ai_world_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL DEFAULT 'world_state',
  faction_name TEXT,
  turn_range_from INT,
  turn_range_to INT,
  summary_text TEXT NOT NULL,
  key_facts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_world_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to ai world summaries"
  ON public.ai_world_summaries
  FOR ALL
  USING (true)
  WITH CHECK (true);
