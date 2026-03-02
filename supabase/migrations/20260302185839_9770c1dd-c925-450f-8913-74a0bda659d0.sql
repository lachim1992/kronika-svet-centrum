
-- ═══════════════════════════════════════════
-- DIPLOMATIC PACTS — mechanical consequences for diplomacy
-- ═══════════════════════════════════════════

CREATE TABLE public.diplomatic_pacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  
  -- Participants (player names or AI faction names)
  party_a TEXT NOT NULL,
  party_b TEXT NOT NULL,
  
  -- Pact type
  pact_type TEXT NOT NULL DEFAULT 'alliance',
  -- Valid: alliance, embargo, open_borders, defense_pact, condemnation, joint_decree
  
  -- Target of condemnation/joint decree (third party)
  target_party TEXT,
  
  -- Mechanical effects (JSON for flexibility)
  effects JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- open_borders: {"trade_efficiency_bonus": 0.15, "birth_rate_bonus": 0.05, "migration_bonus": 0.1}
  -- embargo: {"trade_blocked": true, "post_embargo_penalty": 0.3}
  -- condemnation: {"disposition_penalty": -10}
  -- defense_pact: {"auto_war_on_attack": true}
  -- joint_decree: {"custom_effect": "..."}
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active',
  -- Valid: proposed, active, expired, broken, rejected
  
  proposed_by TEXT NOT NULL,
  proposed_turn INT NOT NULL DEFAULT 1,
  accepted_turn INT,
  expires_turn INT,
  ended_turn INT,
  
  -- Narrative
  proclamation_text TEXT,
  ai_narrative TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_diplomatic_pacts_session ON public.diplomatic_pacts(session_id);
CREATE INDEX idx_diplomatic_pacts_parties ON public.diplomatic_pacts(session_id, party_a, party_b);
CREATE INDEX idx_diplomatic_pacts_status ON public.diplomatic_pacts(session_id, status);
CREATE INDEX idx_diplomatic_pacts_type ON public.diplomatic_pacts(session_id, pact_type);

-- Enable RLS
ALTER TABLE public.diplomatic_pacts ENABLE ROW LEVEL SECURITY;

-- RLS: all authenticated users can read pacts for their sessions
CREATE POLICY "Anyone can read pacts" ON public.diplomatic_pacts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert pacts" ON public.diplomatic_pacts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update pacts" ON public.diplomatic_pacts
  FOR UPDATE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_diplomatic_pacts_updated_at
  BEFORE UPDATE ON public.diplomatic_pacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.diplomatic_pacts;
