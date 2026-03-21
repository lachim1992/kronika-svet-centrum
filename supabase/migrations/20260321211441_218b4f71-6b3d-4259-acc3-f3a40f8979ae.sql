
-- =============================================
-- Phase 1: Province Graph Abstraction Layer
-- =============================================

-- 1. Province adjacency graph table
CREATE TABLE public.province_adjacency (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  province_a UUID NOT NULL REFERENCES public.provinces(id) ON DELETE CASCADE,
  province_b UUID NOT NULL REFERENCES public.provinces(id) ON DELETE CASCADE,
  border_length INTEGER NOT NULL DEFAULT 1,
  border_terrain JSONB DEFAULT '{}',
  is_contested BOOLEAN NOT NULL DEFAULT false,
  strategic_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, province_a, province_b),
  CHECK (province_a < province_b)
);

CREATE INDEX idx_province_adjacency_session ON public.province_adjacency(session_id);
CREATE INDEX idx_province_adjacency_a ON public.province_adjacency(province_a);
CREATE INDEX idx_province_adjacency_b ON public.province_adjacency(province_b);

ALTER TABLE public.province_adjacency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Province adjacency readable by authenticated users"
  ON public.province_adjacency FOR SELECT TO authenticated USING (true);

CREATE POLICY "Province adjacency insertable by authenticated users"
  ON public.province_adjacency FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Add province metadata columns
ALTER TABLE public.provinces
  ADD COLUMN IF NOT EXISTS terrain_profile JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strategic_value INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS economic_profile JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hex_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjacency_computed_at TIMESTAMPTZ;

-- 3. Trigger for updated_at on adjacency
CREATE TRIGGER update_province_adjacency_updated_at
  BEFORE UPDATE ON public.province_adjacency
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
