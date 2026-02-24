-- Add per-city stone production tracking (stone is now a base resource like grain/wood)
ALTER TABLE cities ADD COLUMN last_turn_stone_prod integer NOT NULL DEFAULT 0;

-- Add per-city iron production tracking (iron remains special-only)
ALTER TABLE cities ADD COLUMN last_turn_iron_prod integer NOT NULL DEFAULT 0;