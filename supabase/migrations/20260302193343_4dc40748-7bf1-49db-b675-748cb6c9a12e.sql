-- Fix: recreate view with SECURITY INVOKER (default for views, but let's be explicit)
DROP VIEW IF EXISTS public.chronicle_source;

CREATE VIEW public.chronicle_source
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW public.chronicle_source IS 'Unified chronicle source: game_events (mechanical) + world_events (narrative/prehistory). Security invoker mode.';
