
-- Add student_id FK to games_participants (direct link to academy graduate)
ALTER TABLE public.games_participants
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.academy_students(id);

-- Add portrait and bio to academy_students
ALTER TABLE public.academy_students
  ADD COLUMN IF NOT EXISTS portrait_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add popularity tracking to games_participants (fan votes / crowd popularity)
ALTER TABLE public.games_participants
  ADD COLUMN IF NOT EXISTS crowd_popularity INTEGER NOT NULL DEFAULT 0;

-- Add best_athlete_id and most_popular_id to games_festivals
ALTER TABLE public.games_festivals
  ADD COLUMN IF NOT EXISTS best_athlete_id UUID REFERENCES public.games_participants(id),
  ADD COLUMN IF NOT EXISTS most_popular_id UUID REFERENCES public.games_participants(id);

-- Create national qualification results table
CREATE TABLE IF NOT EXISTS public.games_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id),
  player_name TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.academy_students(id),
  discipline_key TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.games_qualifications ENABLE ROW LEVEL SECURITY;

-- RLS: anyone in the session can read
CREATE POLICY "Anyone can view qualifications"
  ON public.games_qualifications FOR SELECT USING (true);

-- RLS: players can insert/update their own
CREATE POLICY "Players can manage own qualifications"
  ON public.games_qualifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Players can update own qualifications"
  ON public.games_qualifications FOR UPDATE USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_qualifications_festival ON public.games_qualifications(festival_id, player_name);
CREATE INDEX IF NOT EXISTS idx_participants_student ON public.games_participants(student_id);
