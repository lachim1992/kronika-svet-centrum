
-- 1) Regions table (parent of provinces)
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  ai_description text,
  image_url text,
  image_prompt text,
  owner_player text,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to regions" ON public.regions FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_regions_updated_at
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add region_id to provinces
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS ai_description text;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS image_prompt text;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3) Event-Entity many-to-many linking table
CREATE TABLE public.event_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.world_events(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- 'city', 'province', 'region', 'character', 'faction'
  entity_id uuid NOT NULL,
  link_type text NOT NULL DEFAULT 'related', -- 'primary_location', 'related', 'affected'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to event entity links" ON public.event_entity_links FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_event_entity_links_event ON public.event_entity_links(event_id);
CREATE INDEX idx_event_entity_links_entity ON public.event_entity_links(entity_type, entity_id);

-- 4) Encyclopedia images gallery
CREATE TABLE public.encyclopedia_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- 'city', 'province', 'region', 'event', 'character', 'faction'
  entity_id uuid NOT NULL,
  image_url text NOT NULL,
  image_prompt text,
  created_by text NOT NULL DEFAULT 'system', -- 'system', 'admin', 'player_name'
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.encyclopedia_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to encyclopedia images" ON public.encyclopedia_images FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_encyclopedia_images_entity ON public.encyclopedia_images(entity_type, entity_id);

-- 5) Update world_events: add status, created_by_type, affected_players, auto_generate fields
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS created_by_type text NOT NULL DEFAULT 'admin';
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS affected_players text[] DEFAULT '{}';
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS event_category text NOT NULL DEFAULT 'general';
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS created_turn integer;
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS player_edited boolean NOT NULL DEFAULT false;
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS auto_publish_after_turns integer DEFAULT 5;
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS ai_image_url text;
ALTER TABLE public.world_events ADD COLUMN IF NOT EXISTS ai_image_prompt text;
