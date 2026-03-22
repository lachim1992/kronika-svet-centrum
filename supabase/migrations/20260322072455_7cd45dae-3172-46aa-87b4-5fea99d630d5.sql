-- Phase 4: Strategic binding — route-based movement & node control

-- 1. Add node-based positioning to military stacks
ALTER TABLE military_stacks
  ADD COLUMN IF NOT EXISTS current_node_id uuid REFERENCES province_nodes(id),
  ADD COLUMN IF NOT EXISTS travel_route_id uuid REFERENCES province_routes(id),
  ADD COLUMN IF NOT EXISTS travel_progress real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_target_node_id uuid REFERENCES province_nodes(id),
  ADD COLUMN IF NOT EXISTS travel_departed_turn integer;

-- 2. Add control tracking to province nodes
ALTER TABLE province_nodes
  ADD COLUMN IF NOT EXISTS controlled_by text,
  ADD COLUMN IF NOT EXISTS garrison_strength integer DEFAULT 0;

-- 3. Add province control cache
ALTER TABLE provinces
  ADD COLUMN IF NOT EXISTS control_player text,
  ADD COLUMN IF NOT EXISTS control_scores jsonb DEFAULT '{}';

-- 4. Add isolation penalty tracking to realm_resources
ALTER TABLE realm_resources
  ADD COLUMN IF NOT EXISTS isolation_penalty real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_nodes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_nodes integer DEFAULT 0;

-- 5. Index for quick route traversal queries
CREATE INDEX IF NOT EXISTS idx_military_stacks_travel
  ON military_stacks(session_id, travel_route_id)
  WHERE travel_route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_province_nodes_control
  ON province_nodes(session_id, controlled_by)
  WHERE controlled_by IS NOT NULL;