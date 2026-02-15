
-- =============================================
-- PROVINCES TABLE
-- =============================================
CREATE TABLE public.provinces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capital_city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  owner_player TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.provinces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to provinces" ON public.provinces FOR ALL USING (true) WITH CHECK (true);

-- Add province_id to cities
ALTER TABLE public.cities ADD COLUMN province_id UUID REFERENCES public.provinces(id) ON DELETE SET NULL;

-- =============================================
-- DIPLOMACY ROOMS
-- =============================================
CREATE TABLE public.diplomacy_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL DEFAULT 'player_player', -- player_player, player_npc, congress
  participant_a TEXT NOT NULL, -- player name or NPC name
  participant_b TEXT NOT NULL,
  npc_city_state_id UUID REFERENCES public.city_states(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.diplomacy_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to diplomacy rooms" ON public.diplomacy_rooms FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DIPLOMACY MESSAGES
-- =============================================
CREATE TABLE public.diplomacy_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.diplomacy_rooms(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, -- player name or NPC name
  sender_type TEXT NOT NULL DEFAULT 'player', -- player, npc
  message_text TEXT NOT NULL,
  secrecy TEXT NOT NULL DEFAULT 'PRIVATE', -- PUBLIC, PRIVATE, LEAKABLE
  message_tag TEXT, -- trade_offer, tribute_demand, alliance_proposal, threat, peace_treaty, espionage
  leak_chance INTEGER NOT NULL DEFAULT 0, -- 0-100 percent
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.diplomacy_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to diplomacy messages" ON public.diplomacy_messages FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for diplomacy messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.diplomacy_messages;
