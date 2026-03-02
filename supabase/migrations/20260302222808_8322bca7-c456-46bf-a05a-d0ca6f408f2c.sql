
-- Table for storing map generation feedback & learned preferences
CREATE TABLE public.map_gen_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'rating', -- 'rating', 'preference', 'patch_feedback'
  rating INTEGER, -- 1-5 stars for overall map quality
  liked_aspects TEXT[], -- e.g. ['coastlines', 'mountain_ridges', 'biome_diversity']
  disliked_aspects TEXT[], -- e.g. ['too_much_sea', 'isolated_biomes']
  notes TEXT, -- free-form user notes
  map_snapshot JSONB, -- biome_counts, land_ratio, settings used
  patch_request TEXT, -- if feedback is about a specific patch
  patch_result JSONB, -- the patch result that was rated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.map_gen_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON public.map_gen_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.map_gen_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback"
  ON public.map_gen_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- Table for learned generation preferences (aggregated from feedback)
CREATE TABLE public.map_gen_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  preferred_land_ratio NUMERIC DEFAULT 0.55,
  preferred_biome_weights JSONB DEFAULT '{"plains": 1, "forest": 1, "hills": 1, "desert": 0.5, "swamp": 0.3, "tundra": 0.4}',
  preferred_continent_count INTEGER DEFAULT 3,
  preferred_mountain_density NUMERIC DEFAULT 0.5,
  preferred_coastal_richness NUMERIC DEFAULT 0.5,
  style_notes TEXT[], -- accumulated AI-readable style preferences
  total_ratings INTEGER DEFAULT 0,
  avg_rating NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.map_gen_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.map_gen_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own preferences"
  ON public.map_gen_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.map_gen_preferences FOR UPDATE
  USING (auth.uid() = user_id);
