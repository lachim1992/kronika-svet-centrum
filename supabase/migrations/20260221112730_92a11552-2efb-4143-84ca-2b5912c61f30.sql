
-- Travel routes between regions/provinces with distance costs
CREATE TABLE public.travel_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL,
  from_province_id UUID REFERENCES provinces(id),
  to_province_id UUID REFERENCES provinces(id),
  distance_minutes INT NOT NULL DEFAULT 120,
  terrain_modifier FLOAT NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.travel_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to travel routes" ON public.travel_routes FOR ALL USING (true) WITH CHECK (true);

-- Active travel orders (armies/agents in transit)
CREATE TABLE public.travel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL,
  player_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'army',
  entity_id UUID,
  from_province_id UUID REFERENCES provinces(id),
  to_province_id UUID REFERENCES provinces(id),
  departed_at TIMESTAMPTZ DEFAULT now(),
  arrives_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_transit',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to travel orders" ON public.travel_orders FOR ALL USING (true) WITH CHECK (true);

-- Player activity tracking for inactivity system
CREATE TABLE public.player_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL,
  player_name TEXT NOT NULL,
  last_action_at TIMESTAMPTZ DEFAULT now(),
  is_delegated BOOLEAN NOT NULL DEFAULT false,
  delegated_to TEXT,
  delegation_style TEXT DEFAULT 'conservative',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, player_name)
);

ALTER TABLE public.player_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to player activity" ON public.player_activity FOR ALL USING (true) WITH CHECK (true);
