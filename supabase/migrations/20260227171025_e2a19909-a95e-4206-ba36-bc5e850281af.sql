
-- Table to store each player's civilization configuration before world generation
CREATE TABLE public.player_civ_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  realm_name TEXT NOT NULL DEFAULT '',
  settlement_name TEXT NOT NULL DEFAULT '',
  people_name TEXT NOT NULL DEFAULT '',
  culture_name TEXT NOT NULL DEFAULT '',
  language_name TEXT NOT NULL DEFAULT '',
  civ_description TEXT NOT NULL DEFAULT '',
  homeland_biome TEXT NOT NULL DEFAULT 'plains',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.player_civ_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view configs in their games"
  ON public.player_civ_configs FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own config"
  ON public.player_civ_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config"
  ON public.player_civ_configs FOR UPDATE
  USING (auth.uid() = user_id);

-- Add setup_status to game_memberships
ALTER TABLE public.game_memberships
  ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'pending';

-- Enable realtime for lobby updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_civ_configs;

-- Trigger for updated_at
CREATE TRIGGER update_player_civ_configs_updated_at
  BEFORE UPDATE ON public.player_civ_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
