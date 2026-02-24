
-- Trade routes: active resource flows between cities
CREATE TABLE public.trade_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  from_city_id UUID NOT NULL REFERENCES cities(id),
  to_city_id UUID NOT NULL REFERENCES cities(id),
  from_player TEXT NOT NULL,
  to_player TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'gold', -- gold, grain, wood, stone, iron
  amount_per_turn INTEGER NOT NULL DEFAULT 5,
  return_resource_type TEXT, -- what they get back (barter)
  return_amount INTEGER DEFAULT 0,
  duration_turns INTEGER, -- NULL = permanent
  started_turn INTEGER NOT NULL DEFAULT 1,
  expires_turn INTEGER, -- NULL = no expiry
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, cancelled, blocked
  route_safety REAL NOT NULL DEFAULT 1.0, -- 0.0-1.0, affected by wars/bandits
  narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trade offers: proposals between players
CREATE TABLE public.trade_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  from_player TEXT NOT NULL,
  to_player TEXT NOT NULL,
  from_city_id UUID NOT NULL REFERENCES cities(id),
  to_city_id UUID NOT NULL REFERENCES cities(id),
  offer_resources JSONB NOT NULL DEFAULT '{}', -- { "gold": 10, "wood": 5 }
  request_resources JSONB NOT NULL DEFAULT '{}', -- { "iron": 3 }
  duration_turns INTEGER DEFAULT 5,
  message TEXT, -- diplomatic note
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, expired, countered
  responded_at TIMESTAMPTZ,
  turn_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trade_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;

-- RLS policies (game is public-access pattern like other tables)
CREATE POLICY "Public access to trade routes" ON public.trade_routes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to trade offers" ON public.trade_offers FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for trade offers (players need to see incoming offers)
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_offers;
