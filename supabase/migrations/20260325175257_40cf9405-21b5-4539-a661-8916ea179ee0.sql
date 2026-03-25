-- Add node_tier to province_nodes to distinguish major/minor/micro
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS node_tier text NOT NULL DEFAULT 'major';

-- Add minor_node_subtype for the 8 minor types and micro_node_subtype for 12 micro types
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS node_subtype text;

-- Add upgrade_level for minor/micro node upgrades
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS upgrade_level integer NOT NULL DEFAULT 1;

-- Add max_upgrade_level
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS max_upgrade_level integer NOT NULL DEFAULT 3;

-- Add biome_at_build to remember what biome was here when built
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS biome_at_build text;

-- Add production_base (raw output before modifiers)
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS production_base numeric NOT NULL DEFAULT 0;

-- Add flow_target_node_id for manual rerouting (minor→major override)
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS flow_target_node_id uuid REFERENCES public.province_nodes(id);

-- Add spawned_strategic_resource for micronodes that spawned a resource at build
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS spawned_strategic_resource text;

-- Add build_turn tracking
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS built_turn integer;

-- Add builder player
ALTER TABLE public.province_nodes ADD COLUMN IF NOT EXISTS built_by text;

-- Index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_province_nodes_tier ON public.province_nodes (session_id, node_tier);
CREATE INDEX IF NOT EXISTS idx_province_nodes_parent ON public.province_nodes (parent_node_id);