
-- Add Stadion building template
INSERT INTO building_templates (name, category, description, effects, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, max_level, level_data, flavor_text, image_prompt)
VALUES (
  'Stadion',
  'cultural',
  'Sportovní aréna pro ligové zápasy Sphaera. Umožňuje založit městský tým.',
  '{"influence": 3, "population_capacity": 50, "stability": 2}'::jsonb,
  8, 10, 2, 15,
  3,
  'TOWN',
  3,
  '[
    {"level": 1, "name": "Závodiště", "effects": {"influence": 3, "population_capacity": 50, "stability": 2}, "cost_mult": 1, "unlock": "Možnost založit ligový tým"},
    {"level": 2, "name": "Stadion", "effects": {"influence": 6, "population_capacity": 100, "stability": 4, "wealth": 3}, "cost_mult": 2, "unlock": "Příjmy ze vstupného, zvýšení kapacity"},
    {"level": 3, "name": "Velký stadion", "effects": {"influence": 10, "population_capacity": 200, "stability": 6, "wealth": 6, "trade_bonus": 2}, "cost_mult": 4, "unlock": "Obchodní bonus, prestiž"}
  ]'::jsonb,
  'Písečná plocha obklopená dřevěnými tribunami, kde davy jásají při každém gólu.',
  'Ancient Roman stadium with sand field, wooden stands filled with spectators, medieval fantasy style'
);

-- Add stadium_building_id column to league_teams if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'league_teams' AND column_name = 'stadium_building_id') THEN
    ALTER TABLE league_teams ADD COLUMN stadium_building_id text;
  END IF;
END $$;
