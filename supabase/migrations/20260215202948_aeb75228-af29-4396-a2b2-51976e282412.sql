
-- 1) Civilization DNA (Player Identity)
CREATE TABLE public.civilizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  civ_name text NOT NULL DEFAULT 'Neznámý národ',
  core_myth text,
  cultural_quirk text,
  architectural_style text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name)
);
ALTER TABLE public.civilizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to civilizations" ON public.civilizations FOR ALL USING (true) WITH CHECK (true);

-- 2) Great Persons
CREATE TABLE public.great_persons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  city_id uuid REFERENCES public.cities(id),
  name text NOT NULL,
  person_type text NOT NULL DEFAULT 'Generál',
  flavor_trait text,
  is_alive boolean NOT NULL DEFAULT true,
  born_round integer NOT NULL DEFAULT 1,
  died_round integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.great_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to great persons" ON public.great_persons FOR ALL USING (true) WITH CHECK (true);

-- 3) Declarations & Manifestos
CREATE TABLE public.declarations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  declaration_type text NOT NULL DEFAULT 'proclamation',
  original_text text NOT NULL,
  epic_text text,
  turn_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to declarations" ON public.declarations FOR ALL USING (true) WITH CHECK (true);

-- 4) World Crises (NPC events)
CREATE TABLE public.world_crises (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  crisis_type text NOT NULL DEFAULT 'sea_peoples',
  title text NOT NULL,
  description text NOT NULL,
  affected_cities text[] DEFAULT '{}',
  trigger_round integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  resolved_round integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.world_crises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to world crises" ON public.world_crises FOR ALL USING (true) WITH CHECK (true);

-- 5) Secret Objectives (Destiny Cards)
CREATE TABLE public.secret_objectives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  objective_text text NOT NULL,
  fulfilled boolean NOT NULL DEFAULT false,
  fulfilled_round integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name)
);
ALTER TABLE public.secret_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to secret objectives" ON public.secret_objectives FOR ALL USING (true) WITH CHECK (true);

-- 6) Fog of History: add truth_state to game_events
ALTER TABLE public.game_events ADD COLUMN IF NOT EXISTS truth_state text NOT NULL DEFAULT 'canon';

-- 7) Era tracking on sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS current_era text NOT NULL DEFAULT 'ancient';

-- 8) City ruins layer
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS ruins_note text;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS devastated_round integer;

-- 9) Indexes
CREATE INDEX idx_great_persons_session ON public.great_persons(session_id);
CREATE INDEX idx_declarations_session ON public.declarations(session_id);
CREATE INDEX idx_world_crises_session ON public.world_crises(session_id);
CREATE INDEX idx_civilizations_session ON public.civilizations(session_id);
