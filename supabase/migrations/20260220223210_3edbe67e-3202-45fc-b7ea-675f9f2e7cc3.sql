
-- ============================================================
-- CHRONICLE v2 MILESTONE 1 — NON-DESTRUCTIVE MIGRATION
-- ============================================================

-- 1.2 City-level additions (new columns on existing cities table)
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS settlement_level text NOT NULL DEFAULT 'HAMLET',
  ADD COLUMN IF NOT EXISTS population_total integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS population_peasants integer NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS population_burghers integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS population_clerics integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS city_stability integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS local_granary_capacity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS local_grain_reserve integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vulnerability_score float NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS famine_turn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS famine_severity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_layers boolean NOT NULL DEFAULT false;

-- 1.3 Realm-level resources (global pool)
CREATE TABLE IF NOT EXISTS public.realm_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  grain_reserve integer NOT NULL DEFAULT 0,
  wood_reserve integer NOT NULL DEFAULT 0,
  stone_reserve integer NOT NULL DEFAULT 0,
  iron_reserve integer NOT NULL DEFAULT 0,
  horses_reserve integer NOT NULL DEFAULT 0,
  labor_reserve integer NOT NULL DEFAULT 0,
  gold_reserve integer NOT NULL DEFAULT 100,
  knowledge integer NOT NULL DEFAULT 0,
  prestige integer NOT NULL DEFAULT 0,
  stability integer NOT NULL DEFAULT 70,
  granary_capacity integer NOT NULL DEFAULT 500,
  stables_capacity integer NOT NULL DEFAULT 100,
  mobilization_rate float NOT NULL DEFAULT 0.10,
  manpower_pool integer NOT NULL DEFAULT 0,
  manpower_committed integer NOT NULL DEFAULT 0,
  logistic_capacity integer NOT NULL DEFAULT 0,
  last_processed_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name)
);

ALTER TABLE public.realm_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to realm resources" ON public.realm_resources FOR ALL USING (true) WITH CHECK (true);

-- 1.4 Realm infrastructure
CREATE TABLE IF NOT EXISTS public.realm_infrastructure (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  granaries_count integer NOT NULL DEFAULT 1,
  granary_level integer NOT NULL DEFAULT 1,
  stables_count integer NOT NULL DEFAULT 1,
  stables_level integer NOT NULL DEFAULT 1,
  slavery_factor float NOT NULL DEFAULT 0.0,
  notes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name)
);

ALTER TABLE public.realm_infrastructure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to realm infrastructure" ON public.realm_infrastructure FOR ALL USING (true) WITH CHECK (true);

-- 1.5A Military stacks
CREATE TABLE IF NOT EXISTS public.military_stacks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  province_id uuid REFERENCES public.provinces(id),
  name text NOT NULL,
  formation_type text NOT NULL DEFAULT 'UNIT',
  general_id uuid,
  morale integer NOT NULL DEFAULT 70,
  is_active boolean NOT NULL DEFAULT true,
  power integer NOT NULL DEFAULT 0,
  legacy_military_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.military_stacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to military stacks" ON public.military_stacks FOR ALL USING (true) WITH CHECK (true);

-- 1.5B Military stack composition
CREATE TABLE IF NOT EXISTS public.military_stack_composition (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stack_id uuid NOT NULL REFERENCES public.military_stacks(id) ON DELETE CASCADE,
  unit_type text NOT NULL DEFAULT 'INFANTRY',
  manpower integer NOT NULL DEFAULT 0,
  quality integer NOT NULL DEFAULT 50,
  equipment_level integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.military_stack_composition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to military stack composition" ON public.military_stack_composition FOR ALL USING (true) WITH CHECK (true);

-- 1.5C Generals
CREATE TABLE IF NOT EXISTS public.generals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  name text NOT NULL,
  skill integer NOT NULL DEFAULT 50,
  traits jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to generals" ON public.generals FOR ALL USING (true) WITH CHECK (true);

-- Add FK from military_stacks.general_id to generals
ALTER TABLE public.military_stacks
  ADD CONSTRAINT military_stacks_general_id_fkey
  FOREIGN KEY (general_id) REFERENCES public.generals(id)
  ON DELETE SET NULL;

-- Legacy migration tracking
CREATE TABLE IF NOT EXISTS public.legacy_military_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id uuid NOT NULL UNIQUE,
  stack_id uuid NOT NULL REFERENCES public.military_stacks(id),
  migrated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_military_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to legacy military map" ON public.legacy_military_map FOR ALL USING (true) WITH CHECK (true);

-- Add migrated flag to legacy table
ALTER TABLE public.military_capacity
  ADD COLUMN IF NOT EXISTS migrated boolean NOT NULL DEFAULT false;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.realm_resources;
ALTER PUBLICATION supabase_realtime ADD TABLE public.military_stacks;

-- ============================================================
-- BACKFILL: Set settlement_level from existing 'level' column
-- ============================================================
UPDATE public.cities SET settlement_level = 
  CASE 
    WHEN level = 'Osada' THEN 'HAMLET'
    WHEN level = 'Městečko' THEN 'TOWNSHIP'
    WHEN level = 'Město' THEN 'CITY'
    WHEN level = 'Polis' THEN 'POLIS'
    ELSE 'HAMLET'
  END
WHERE settlement_level = 'HAMLET';

-- Backfill population based on settlement level
UPDATE public.cities SET
  population_total = CASE settlement_level
    WHEN 'HAMLET' THEN 1000
    WHEN 'TOWNSHIP' THEN 3000
    WHEN 'CITY' THEN 8000
    WHEN 'POLIS' THEN 15000
    ELSE 1000
  END,
  population_peasants = CASE settlement_level
    WHEN 'HAMLET' THEN 800
    WHEN 'TOWNSHIP' THEN 1800
    WHEN 'CITY' THEN 3200
    WHEN 'POLIS' THEN 3000
    ELSE 800
  END,
  population_burghers = CASE settlement_level
    WHEN 'HAMLET' THEN 150
    WHEN 'TOWNSHIP' THEN 900
    WHEN 'CITY' THEN 3200
    WHEN 'POLIS' THEN 8250
    ELSE 150
  END,
  population_clerics = CASE settlement_level
    WHEN 'HAMLET' THEN 50
    WHEN 'TOWNSHIP' THEN 300
    WHEN 'CITY' THEN 1600
    WHEN 'POLIS' THEN 3750
    ELSE 50
  END
WHERE population_total = 1000 AND settlement_level != 'HAMLET';
