
-- Add hosting count to cities for legacy tracking
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS hosting_count integer NOT NULL DEFAULT 0;

-- Add candidacy phase columns to games_festivals
ALTER TABLE public.games_festivals ADD COLUMN IF NOT EXISTS candidacy_deadline_turn integer;
ALTER TABLE public.games_festivals ADD COLUMN IF NOT EXISTS host_selection_method text NOT NULL DEFAULT 'auto';
-- host_selection_method: 'auto' (old behavior), 'candidacy' (new bidding system)

-- Add diplomatic support and lobbying columns to games_bids
ALTER TABLE public.games_bids ADD COLUMN IF NOT EXISTS diplomatic_support jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.games_bids ADD COLUMN IF NOT EXISTS stability_score real NOT NULL DEFAULT 0;
ALTER TABLE public.games_bids ADD COLUMN IF NOT EXISTS hosting_legacy_bonus real NOT NULL DEFAULT 0;

-- Economic effects tracking on festivals
ALTER TABLE public.games_festivals ADD COLUMN IF NOT EXISTS host_effects_applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.games_festivals ADD COLUMN IF NOT EXISTS host_economic_result jsonb;
-- stores: { trade_income, infrastructure_cost, stability_change, prestige_gained, population_change }
