
-- ══════════════════════════════════════════════════
-- LIVE FEED + GLADIATOR EXTENSIONS
-- ══════════════════════════════════════════════════

-- 1. Live feed entries for dramatic pseudo-realtime narration
CREATE TABLE public.games_live_feed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  discipline_id UUID REFERENCES public.games_disciplines(id),
  sequence_num INTEGER NOT NULL DEFAULT 0,
  feed_type TEXT NOT NULL DEFAULT 'narration',
  text TEXT NOT NULL,
  participant_id UUID,
  roll_value REAL,
  drama_level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_live_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Live feed is public" ON public.games_live_feed FOR SELECT USING (true);
CREATE POLICY "Live feed insert" ON public.games_live_feed FOR INSERT WITH CHECK (true);

CREATE INDEX idx_live_feed_festival ON public.games_live_feed(festival_id, sequence_num);

-- 2. Academy rankings (snapshot per turn for history)
CREATE TABLE public.academy_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  academy_id UUID NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL DEFAULT 1,
  rank_position INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  victories INTEGER NOT NULL DEFAULT 0,
  champions INTEGER NOT NULL DEFAULT 0,
  survivors INTEGER NOT NULL DEFAULT 0,
  prestige INTEGER NOT NULL DEFAULT 0,
  international_participations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(academy_id, turn_number)
);

ALTER TABLE public.academy_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rankings are public" ON public.academy_rankings FOR SELECT USING (true);
CREATE POLICY "Rankings insert" ON public.academy_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "Rankings update" ON public.academy_rankings FOR UPDATE USING (true);

-- 3. Gladiator extensions on academies
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS is_gladiatorial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS crowd_popularity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS elite_favor INTEGER NOT NULL DEFAULT 50;
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS people_favor INTEGER NOT NULL DEFAULT 50;
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS revolt_risk INTEGER NOT NULL DEFAULT 0;

-- 4. Gladiator combat records
CREATE TABLE public.gladiator_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.academy_students(id) ON DELETE CASCADE,
  academy_id UUID NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  fights INTEGER NOT NULL DEFAULT 0,
  victories INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  injuries INTEGER NOT NULL DEFAULT 0,
  crowd_favor INTEGER NOT NULL DEFAULT 50,
  is_icon BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  died_turn INTEGER,
  cause_of_death TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gladiator_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gladiator records public" ON public.gladiator_records FOR SELECT USING (true);
CREATE POLICY "Gladiator records insert" ON public.gladiator_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Gladiator records update" ON public.gladiator_records FOR UPDATE USING (true);

CREATE INDEX idx_gladiator_academy ON public.gladiator_records(academy_id);

-- 5. Enable realtime for live feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.games_live_feed;
