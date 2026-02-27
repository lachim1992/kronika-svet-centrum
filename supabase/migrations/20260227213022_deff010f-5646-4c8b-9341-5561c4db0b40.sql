
-- Structured civilization identity extracted from civ_description
CREATE TABLE public.civ_identity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  
  -- Structured tags extracted by AI
  culture_tags TEXT[] NOT NULL DEFAULT '{}',
  urban_style TEXT NOT NULL DEFAULT 'organic',
  society_structure TEXT NOT NULL DEFAULT 'tribal',
  military_doctrine TEXT NOT NULL DEFAULT 'defensive',
  economic_focus TEXT NOT NULL DEFAULT 'agrarian',
  
  -- Numeric modifiers derived from tags
  grain_modifier REAL NOT NULL DEFAULT 0,
  production_modifier REAL NOT NULL DEFAULT 0,
  trade_modifier REAL NOT NULL DEFAULT 0,
  stability_modifier REAL NOT NULL DEFAULT 0,
  morale_modifier REAL NOT NULL DEFAULT 0,
  mobilization_speed REAL NOT NULL DEFAULT 1.0,
  
  -- Source data for auditing
  source_description TEXT,
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  extraction_model TEXT DEFAULT 'gemini-3-flash-preview',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(session_id, player_name)
);

-- RLS
ALTER TABLE public.civ_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read civ_identity"
  ON public.civ_identity FOR SELECT USING (true);

CREATE POLICY "Service insert/update civ_identity"
  ON public.civ_identity FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX idx_civ_identity_session ON public.civ_identity(session_id);
