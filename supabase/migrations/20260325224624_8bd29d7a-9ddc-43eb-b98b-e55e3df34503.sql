ALTER TABLE province_nodes
  ADD COLUMN IF NOT EXISTS upkeep_supplies numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upkeep_wealth numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_balance numeric DEFAULT 0;