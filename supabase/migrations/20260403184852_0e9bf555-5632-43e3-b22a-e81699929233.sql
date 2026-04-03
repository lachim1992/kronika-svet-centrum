
-- =============================================
-- Chronicle Economy v4.1 — Phase 4-5: Extend Existing Tables
-- =============================================

-- Phase 4a: province_nodes extensions
ALTER TABLE public.province_nodes
  ADD COLUMN IF NOT EXISTS production_role text DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS capability_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS active_recipes jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS guild_level int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS specialization_scores jsonb DEFAULT '{}';

-- Phase 4b: province_hexes extensions
ALTER TABLE public.province_hexes
  ADD COLUMN IF NOT EXISTS resource_deposits jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS geology_type text,
  ADD COLUMN IF NOT EXISTS forest_density int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_score numeric DEFAULT 1.0;

-- Phase 5: realm_resources extensions
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS commercial_retention numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_capture numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_population numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_market numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_transit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_extraction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_ideology text DEFAULT 'customary_local';

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_pn_production_role ON public.province_nodes(production_role);
CREATE INDEX IF NOT EXISTS idx_pn_guild_level ON public.province_nodes(guild_level);
CREATE INDEX IF NOT EXISTS idx_ph_geology ON public.province_hexes(geology_type);
