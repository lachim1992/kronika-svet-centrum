-- Add owner_player to province_hexes for direct hex ownership tracking
ALTER TABLE public.province_hexes ADD COLUMN IF NOT EXISTS owner_player text;

-- Add map dimensions to world_foundations
ALTER TABLE public.world_foundations ADD COLUMN IF NOT EXISTS map_width integer DEFAULT 21;
ALTER TABLE public.world_foundations ADD COLUMN IF NOT EXISTS map_height integer DEFAULT 21;
ALTER TABLE public.world_foundations ADD COLUMN IF NOT EXISTS npc_count integer DEFAULT 3;
ALTER TABLE public.world_foundations ADD COLUMN IF NOT EXISTS npc_placement text DEFAULT 'balanced';

-- Index for fast lookups by owner
CREATE INDEX IF NOT EXISTS idx_province_hexes_owner ON public.province_hexes (session_id, owner_player) WHERE owner_player IS NOT NULL;

-- Index for fast province membership lookups
CREATE INDEX IF NOT EXISTS idx_province_hexes_province ON public.province_hexes (session_id, province_id) WHERE province_id IS NOT NULL;