-- Migration 1: Military stacks deployment columns
ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS hex_q integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hex_r integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_deployed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moved_this_turn boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_military_stacks_hex ON public.military_stacks (hex_q, hex_r);
CREATE INDEX IF NOT EXISTS idx_military_stacks_deployed ON public.military_stacks (session_id, is_deployed) WHERE is_deployed = true;

-- Migration 2: Enhance action_queue with turn tracking
ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS created_turn integer,
  ADD COLUMN IF NOT EXISTS execute_on_turn integer;

CREATE INDEX IF NOT EXISTS idx_action_queue_pending ON public.action_queue (status, execute_on_turn, action_type);

-- Migration 3: Battles table (pure structural, no AI narrative)
CREATE TABLE IF NOT EXISTS public.battles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  turn_number integer NOT NULL DEFAULT 1,
  attacker_stack_id uuid NOT NULL REFERENCES public.military_stacks(id),
  defender_stack_id uuid REFERENCES public.military_stacks(id),
  defender_city_id uuid REFERENCES public.cities(id),
  
  -- Snapshots for replay/debug
  attacker_strength_snapshot integer NOT NULL DEFAULT 0,
  defender_strength_snapshot integer NOT NULL DEFAULT 0,
  attacker_morale_snapshot integer NOT NULL DEFAULT 0,
  defender_morale_snapshot integer NOT NULL DEFAULT 0,
  speech_text text,
  speech_morale_modifier integer NOT NULL DEFAULT 0,
  
  -- Environment
  biome text NOT NULL DEFAULT 'plains',
  fortification_bonus real NOT NULL DEFAULT 0,
  
  -- RNG
  seed bigint NOT NULL DEFAULT 0,
  luck_roll real NOT NULL DEFAULT 0,
  
  -- Outputs
  result text NOT NULL DEFAULT 'pending',
  casualties_attacker integer NOT NULL DEFAULT 0,
  casualties_defender integer NOT NULL DEFAULT 0,
  post_action text,
  resolved_at timestamp with time zone,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Either defender_stack or defender_city must be set
  CONSTRAINT battles_defender_check CHECK (
    defender_stack_id IS NOT NULL OR defender_city_id IS NOT NULL
  )
);

ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to battles"
  ON public.battles FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_battles_session_turn ON public.battles (session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_battles_pending ON public.battles (result) WHERE result = 'pending';