
-- ══════════════════════════════════════════════════
-- ACADEMIA & ARENA SYSTEM — MVP
-- ══════════════════════════════════════════════════

-- 1. Academies (schools with profile curves)
CREATE TABLE public.academies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Nová akademie',
  motto TEXT,
  description TEXT,
  emblem_url TEXT,
  color_primary TEXT DEFAULT '#c0a040',
  color_secondary TEXT DEFAULT '#1a1a2e',
  training_philosophy TEXT,
  -- Profile curve (0–100 each)
  profile_athletics INTEGER NOT NULL DEFAULT 50,
  profile_combat INTEGER NOT NULL DEFAULT 30,
  profile_culture INTEGER NOT NULL DEFAULT 20,
  profile_strategy INTEGER NOT NULL DEFAULT 10,
  profile_brutality INTEGER NOT NULL DEFAULT 5,
  -- Core stats
  reputation INTEGER NOT NULL DEFAULT 10,
  infrastructure INTEGER NOT NULL DEFAULT 10,
  trainer_level INTEGER NOT NULL DEFAULT 10,
  nutrition INTEGER NOT NULL DEFAULT 10,
  corruption INTEGER NOT NULL DEFAULT 0,
  fan_base INTEGER NOT NULL DEFAULT 0,
  -- Tracking
  total_graduates INTEGER NOT NULL DEFAULT 0,
  total_champions INTEGER NOT NULL DEFAULT 0,
  total_fatalities INTEGER NOT NULL DEFAULT 0,
  founded_turn INTEGER NOT NULL DEFAULT 1,
  last_training_turn INTEGER NOT NULL DEFAULT 0,
  training_cycle_turns INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active',
  -- Building link
  building_id UUID REFERENCES public.city_buildings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Academies are viewable by session players" ON public.academies FOR SELECT USING (true);
CREATE POLICY "Academies can be updated by owner" ON public.academies FOR UPDATE USING (true);
CREATE POLICY "Academies can be inserted" ON public.academies FOR INSERT WITH CHECK (true);

CREATE INDEX idx_academies_session ON public.academies(session_id);
CREATE INDEX idx_academies_city ON public.academies(city_id);

-- 2. Academy Students
CREATE TABLE public.academy_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Stats (generated from school profile)
  strength INTEGER NOT NULL DEFAULT 40,
  endurance INTEGER NOT NULL DEFAULT 40,
  agility INTEGER NOT NULL DEFAULT 40,
  tactics INTEGER NOT NULL DEFAULT 40,
  charisma INTEGER NOT NULL DEFAULT 40,
  -- Specialty
  specialty TEXT NOT NULL DEFAULT 'general',
  traits TEXT[] DEFAULT '{}',
  -- Lifecycle
  training_started_turn INTEGER NOT NULL DEFAULT 1,
  graduation_turn INTEGER,
  status TEXT NOT NULL DEFAULT 'training',
  -- Link to games_participants when promoted
  promoted_to_participant_id UUID,
  great_person_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students are viewable by session" ON public.academy_students FOR SELECT USING (true);
CREATE POLICY "Students can be inserted" ON public.academy_students FOR INSERT WITH CHECK (true);
CREATE POLICY "Students can be updated" ON public.academy_students FOR UPDATE USING (true);

CREATE INDEX idx_students_academy ON public.academy_students(academy_id);
CREATE INDEX idx_students_session ON public.academy_students(session_id);
CREATE INDEX idx_students_status ON public.academy_students(status);

-- 3. Add sport_funding_pct to realm_resources
ALTER TABLE public.realm_resources ADD COLUMN IF NOT EXISTS sport_funding_pct REAL NOT NULL DEFAULT 0;

-- 4. Auto-create wiki entry for academy
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_academy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'academy', NEW.id, NEW.name, NEW.player_name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wiki_academy
AFTER INSERT ON public.academies
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_wiki_entry_for_academy();

-- 5. Trigger for updated_at
CREATE TRIGGER update_academies_updated_at
BEFORE UPDATE ON public.academies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable realtime for academies
ALTER PUBLICATION supabase_realtime ADD TABLE public.academies;
