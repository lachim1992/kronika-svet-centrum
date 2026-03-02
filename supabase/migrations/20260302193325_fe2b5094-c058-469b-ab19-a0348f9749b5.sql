
-- Create a unified view that merges game_events and world_events into one chronicle source
CREATE OR REPLACE VIEW public.chronicle_source AS

-- game_events: mechanical events from turn 1+
SELECT
  ge.id,
  ge.session_id,
  ge.event_type AS event_category,
  ge.event_type,
  ge.note AS title,
  ge.note AS summary,
  ge.note AS description,
  ge.player AS affected_player,
  ge.location,
  ge.turn_number,
  ge.created_at,
  ge.city_id,
  ge.importance,
  ge.reference,
  NULL::text AS ai_image_url,
  NULL::text AS ai_image_prompt,
  NULL::text[] AS tags,
  NULL::jsonb AS participants,
  'game_event' AS source_table,
  ge.confirmed
FROM game_events ge
WHERE ge.confirmed = true

UNION ALL

-- world_events: narrative events (prehistory, manual)
SELECT
  we.id,
  we.session_id,
  we.event_category,
  we.event_category AS event_type,
  we.title,
  we.summary,
  we.description,
  NULL AS affected_player,
  NULL AS location,
  we.created_turn AS turn_number,
  we.created_at,
  we.location_id AS city_id,
  NULL AS importance,
  we.references AS reference,
  we.ai_image_url,
  we.ai_image_prompt,
  we.tags,
  we.participants,
  'world_event' AS source_table,
  (we.status = 'published') AS confirmed
FROM world_events we;

-- Add comment for documentation
COMMENT ON VIEW public.chronicle_source IS 'Unified chronicle source combining game_events (mechanical, turn 1+) and world_events (narrative, prehistory). All chronicle/saga/wiki pipelines should read from this view.';
