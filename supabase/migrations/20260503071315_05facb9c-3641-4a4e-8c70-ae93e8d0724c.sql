
-- Inkrement 0: DB invariants for road movement & construction lifecycle

-- game_events: claim lock columns + idempotence index for route_completed
ALTER TABLE public.game_events
  ADD COLUMN IF NOT EXISTS processed_at          timestamptz NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS game_events_route_completed_uniq
  ON public.game_events(
    session_id,
    event_type,
    ((reference->>'route_id')),
    ((reference->>'construction_generation'))
  )
  WHERE event_type = 'route_completed';

CREATE INDEX IF NOT EXISTS game_events_route_completed_pending_idx
  ON public.game_events(session_id, turn_number)
  WHERE event_type = 'route_completed' AND processed_at IS NULL;

-- flow_paths: upsert key by route_id
CREATE UNIQUE INDEX IF NOT EXISTS flow_paths_route_id_uniq
  ON public.flow_paths(route_id) WHERE route_id IS NOT NULL;

-- province_routes: planned path + completion metadata
ALTER TABLE public.province_routes
  ADD COLUMN IF NOT EXISTS completed_at            timestamptz NULL,
  ADD COLUMN IF NOT EXISTS planned_hex_path        jsonb       NULL,
  ADD COLUMN IF NOT EXISTS construction_generation int         NOT NULL DEFAULT 1;
