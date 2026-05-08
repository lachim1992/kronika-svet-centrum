-- AI war planning (staging invasions before declaring war)
CREATE TABLE IF NOT EXISTS public.ai_war_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  faction_name text NOT NULL,
  target_player text NOT NULL,
  target_city_id uuid NULL,
  staging_started_turn integer NOT NULL,
  staging_max_turns integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','executed','aborted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_war_plans_session ON public.ai_war_plans(session_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_war_plans_faction ON public.ai_war_plans(session_id, faction_name, status);

ALTER TABLE public.ai_war_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view AI war plans"
  ON public.ai_war_plans FOR SELECT
  USING (true);

CREATE TRIGGER update_ai_war_plans_updated_at
  BEFORE UPDATE ON public.ai_war_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Surprise war marker
ALTER TABLE public.war_declarations
  ADD COLUMN IF NOT EXISTS surprise_war boolean NOT NULL DEFAULT false;