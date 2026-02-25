
-- 1. Přidat počítadlo konsekutivních kol hladomoru do cities
ALTER TABLE public.cities
ADD COLUMN IF NOT EXISTS famine_consecutive_turns integer NOT NULL DEFAULT 0;

-- 2. Vytvořit tabulku pro vzpoury
CREATE TABLE public.city_uprisings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  player_name text NOT NULL,
  turn_triggered integer NOT NULL DEFAULT 1,
  escalation_level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  
  -- AI generated content
  crowd_text text,
  advisor_analysis text,
  demands jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Player response
  player_response_text text,
  chosen_concession text,
  resolved_turn integer,
  
  -- Mechanical effects applied
  effects_applied jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.city_uprisings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to city uprisings"
ON public.city_uprisings
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for quick lookup
CREATE INDEX idx_city_uprisings_active ON public.city_uprisings (session_id, city_id, status)
WHERE status IN ('pending', 'escalated');

-- Trigger for updated_at
CREATE TRIGGER update_city_uprisings_updated_at
BEFORE UPDATE ON public.city_uprisings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
