
-- Action Queue: pending actions with time costs
CREATE TABLE public.action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL,
  player_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to action queue" ON public.action_queue FOR ALL USING (true) WITH CHECK (true);

-- Time Pools: per-entity time budgets
CREATE TABLE public.time_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  pool_name TEXT NOT NULL,
  total_minutes INT NOT NULL DEFAULT 480,
  used_minutes INT NOT NULL DEFAULT 0,
  resets_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.time_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to time pools" ON public.time_pools FOR ALL USING (true) WITH CHECK (true);

-- Server Config: per-session persistent world settings
CREATE TABLE public.server_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) NOT NULL UNIQUE,
  time_scale FLOAT NOT NULL DEFAULT 1.0,
  tick_interval_seconds INT NOT NULL DEFAULT 60,
  max_players INT NOT NULL DEFAULT 50,
  admin_user_id UUID,
  economic_params JSONB NOT NULL DEFAULT '{}',
  inactivity_threshold_hours INT NOT NULL DEFAULT 48,
  delegation_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.server_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to server config" ON public.server_config FOR ALL USING (true) WITH CHECK (true);
