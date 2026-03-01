
-- =============================================
-- GAMES & FESTIVALS SYSTEM
-- =============================================

-- 1. Main festivals/games table (both world olympics and local festivals)
CREATE TABLE public.games_festivals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_type TEXT NOT NULL DEFAULT 'olympic', -- 'olympic' | 'local_gladiator' | 'local_harvest' | 'local_tournament' | 'local_academic' | 'local_religious'
  name TEXT NOT NULL,
  host_city_id UUID REFERENCES public.cities(id),
  host_player TEXT,
  status TEXT NOT NULL DEFAULT 'announced', -- 'announced' | 'nomination' | 'qualifying' | 'finals' | 'concluded' | 'cancelled'
  announced_turn INT NOT NULL DEFAULT 1,
  finals_turn INT, -- when finals happen
  concluded_turn INT,
  description TEXT,
  prestige_pool INT NOT NULL DEFAULT 0, -- accumulated prestige from investments
  total_investment_gold INT NOT NULL DEFAULT 0,
  incident_chance REAL NOT NULL DEFAULT 0.0, -- grows with corruption/tensions
  is_global BOOLEAN NOT NULL DEFAULT false,
  effects_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_festivals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_festivals_select" ON public.games_festivals FOR SELECT USING (true);
CREATE POLICY "games_festivals_insert" ON public.games_festivals FOR INSERT WITH CHECK (true);
CREATE POLICY "games_festivals_update" ON public.games_festivals FOR UPDATE USING (true);

-- 2. Disciplines
CREATE TABLE public.games_disciplines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE, -- 'sprint', 'wrestling', 'rhetoric', etc.
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'physical' | 'intellectual' | 'cultural' | 'strategic'
  description TEXT,
  primary_stat TEXT NOT NULL DEFAULT 'strength', -- which athlete stat matters most
  secondary_stat TEXT, -- secondary stat
  prestige_weight REAL NOT NULL DEFAULT 1.0, -- how much prestige this discipline gives
  icon_emoji TEXT NOT NULL DEFAULT '🏅'
);

-- Seed 10 disciplines
INSERT INTO public.games_disciplines (key, name, category, description, primary_stat, secondary_stat, prestige_weight, icon_emoji) VALUES
  ('sprint', 'Běh', 'physical', 'Závod v rychlosti na krátkou vzdálenost', 'agility', 'endurance', 1.0, '🏃'),
  ('wrestling', 'Zápas', 'physical', 'Síla proti síle v přímém souboji', 'strength', 'endurance', 1.2, '🤼'),
  ('archery', 'Lukostřelba', 'physical', 'Přesnost a klid pod tlakem', 'tactics', 'agility', 1.0, '🏹'),
  ('horse_racing', 'Dostihy', 'physical', 'Jízda na koni na čas', 'agility', 'charisma', 1.1, '🐎'),
  ('rhetoric', 'Rétorika', 'intellectual', 'Umění přesvědčit a okouzlit slovem', 'charisma', 'tactics', 1.0, '🗣️'),
  ('philosophy', 'Filozofický duel', 'intellectual', 'Hluboké myšlení a argumentace', 'tactics', 'charisma', 0.9, '🧠'),
  ('poetry', 'Básnický souboj', 'cultural', 'Krása jazyka a metafory', 'charisma', 'tactics', 1.0, '📜'),
  ('sculpture', 'Sochařství', 'cultural', 'Mistrovství materiálu a formy', 'strength', 'charisma', 1.1, '🗿'),
  ('war_simulation', 'Simulovaná bitva', 'strategic', 'Taktické cvičení bez skutečné krve', 'tactics', 'strength', 1.3, '⚔️'),
  ('engineering', 'Inženýrská výzva', 'strategic', 'Konstrukce a inovace pod tlakem', 'tactics', 'endurance', 1.0, '🏗️');

-- 3. Participants (athletes) — hybrid: start anonymous, winners become great_persons
CREATE TABLE public.games_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  city_id UUID REFERENCES public.cities(id),
  -- Identity
  athlete_name TEXT NOT NULL,
  background TEXT, -- AI-generated backstory
  -- Core stats (1-100)
  strength INT NOT NULL DEFAULT 50,
  endurance INT NOT NULL DEFAULT 50,
  agility INT NOT NULL DEFAULT 50,
  tactics INT NOT NULL DEFAULT 50,
  charisma INT NOT NULL DEFAULT 50,
  -- Modifiers
  training_bonus REAL NOT NULL DEFAULT 0,
  city_infrastructure_bonus REAL NOT NULL DEFAULT 0,
  civ_modifier REAL NOT NULL DEFAULT 0,
  morale_modifier REAL NOT NULL DEFAULT 0,
  -- Traits
  traits TEXT[] NOT NULL DEFAULT '{}',
  -- Form
  form TEXT NOT NULL DEFAULT 'normal', -- 'peak' | 'normal' | 'tired' | 'injured'
  -- Links
  great_person_id UUID REFERENCES public.great_persons(id), -- linked after becoming legend
  sponsor_player TEXT, -- who sponsors this athlete
  -- Meta
  total_medals INT NOT NULL DEFAULT 0,
  is_legend BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_participants_select" ON public.games_participants FOR SELECT USING (true);
CREATE POLICY "games_participants_insert" ON public.games_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "games_participants_update" ON public.games_participants FOR UPDATE USING (true);

-- 4. Results per discipline
CREATE TABLE public.games_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  discipline_id UUID NOT NULL REFERENCES public.games_disciplines(id),
  participant_id UUID NOT NULL REFERENCES public.games_participants(id) ON DELETE CASCADE,
  -- Performance
  base_score REAL NOT NULL DEFAULT 0,
  bonus_score REAL NOT NULL DEFAULT 0,
  variance_score REAL NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  -- Placement
  rank INT, -- 1st, 2nd, 3rd...
  medal TEXT, -- 'gold' | 'silver' | 'bronze' | null
  -- Narrative
  performance_description TEXT, -- AI-generated moment description
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_results_select" ON public.games_results FOR SELECT USING (true);
CREATE POLICY "games_results_insert" ON public.games_results FOR INSERT WITH CHECK (true);

-- 5. Incidents (scandals, injuries, drama)
CREATE TABLE public.games_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL, -- 'injury' | 'bribery' | 'sabotage' | 'riot' | 'poisoning' | 'protest' | 'death'
  severity TEXT NOT NULL DEFAULT 'minor', -- 'minor' | 'major' | 'catastrophic'
  target_participant_id UUID REFERENCES public.games_participants(id),
  instigator_player TEXT, -- who caused it (if known)
  description TEXT NOT NULL,
  effects JSONB NOT NULL DEFAULT '{}',
  turn_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_incidents_select" ON public.games_incidents FOR SELECT USING (true);
CREATE POLICY "games_incidents_insert" ON public.games_incidents FOR INSERT WITH CHECK (true);

-- 6. Host bids (lobbying)
CREATE TABLE public.games_bids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  city_id UUID NOT NULL REFERENCES public.cities(id),
  gold_invested INT NOT NULL DEFAULT 0,
  influence_invested INT NOT NULL DEFAULT 0,
  pitch_text TEXT, -- player's lobbying speech
  cultural_score REAL NOT NULL DEFAULT 0, -- auto-calculated from city stats
  logistics_score REAL NOT NULL DEFAULT 0,
  total_bid_score REAL NOT NULL DEFAULT 0,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(festival_id, player_name)
);

ALTER TABLE public.games_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_bids_select" ON public.games_bids FOR SELECT USING (true);
CREATE POLICY "games_bids_insert" ON public.games_bids FOR INSERT WITH CHECK (true);
CREATE POLICY "games_bids_update" ON public.games_bids FOR UPDATE USING (true);

-- 7. Intrigue actions (sponsorship, sabotage, propaganda)
CREATE TABLE public.games_intrigues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'sponsor' | 'sabotage' | 'bribe' | 'propaganda' | 'spy'
  target_participant_id UUID REFERENCES public.games_participants(id),
  target_player TEXT,
  gold_spent INT NOT NULL DEFAULT 0,
  success BOOLEAN,
  discovered BOOLEAN NOT NULL DEFAULT false, -- was the intrigue exposed?
  description TEXT,
  effects JSONB NOT NULL DEFAULT '{}',
  turn_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_intrigues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_intrigues_select" ON public.games_intrigues FOR SELECT USING (true);
CREATE POLICY "games_intrigues_insert" ON public.games_intrigues FOR INSERT WITH CHECK (true);
CREATE POLICY "games_intrigues_update" ON public.games_intrigues FOR UPDATE USING (true);

-- Indexes
CREATE INDEX idx_games_festivals_session ON public.games_festivals(session_id);
CREATE INDEX idx_games_participants_festival ON public.games_participants(festival_id);
CREATE INDEX idx_games_results_festival ON public.games_results(festival_id);
CREATE INDEX idx_games_incidents_festival ON public.games_incidents(festival_id);
CREATE INDEX idx_games_bids_festival ON public.games_bids(festival_id);
CREATE INDEX idx_games_intrigues_festival ON public.games_intrigues(festival_id);
