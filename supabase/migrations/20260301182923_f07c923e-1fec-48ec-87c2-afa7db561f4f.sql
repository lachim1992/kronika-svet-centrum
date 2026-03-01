
-- Add Arena building template (3 levels, wonder-transformable at level 3)
INSERT INTO building_templates (
  name, category, description, flavor_text,
  cost_wood, cost_stone, cost_iron, cost_wealth, build_turns,
  required_settlement_level, max_level, is_unique,
  effects, level_data, image_prompt
) VALUES (
  'Aréna',
  'cultural',
  'Velkolepé závodiště a sportoviště, kde se odehrávají atletické soutěže a slavnosti. Nezbytné pro pořádání Velkých her.',
  'Zde se rodí hrdinové a legendy. Písek arény pamatuje tisíce kroků, padlých i vítězných.',
  8, 12, 4, 15, 4,
  'town', 3, true,
  '{"influence_bonus": 5, "stability_bonus": 3, "enables_games_hosting": true}'::jsonb,
  '[
    {"level": 1, "name": "Závodiště", "description": "Základní otevřená aréna s dráhou a tribunami pro 500 diváků.", "effects": {"influence_bonus": 5, "stability_bonus": 3, "games_hosting_capacity": 1}, "upgrade_cost_multiplier": 1},
    {"level": 2, "name": "Stadion", "description": "Rozšířený komplex s kamennými tribunami, šatnami a zázemím pro 2000 diváků.", "effects": {"influence_bonus": 12, "stability_bonus": 5, "games_hosting_capacity": 2, "training_bonus": 5}, "upgrade_cost_multiplier": 2},
    {"level": 3, "name": "Velký amfiteátr", "description": "Monumentální stavba se sochami vítězů, podzemními chodbami a kapacitou 5000 diváků.", "effects": {"influence_bonus": 25, "stability_bonus": 8, "games_hosting_capacity": 3, "training_bonus": 10, "wonder_eligible": true}, "upgrade_cost_multiplier": 4}
  ]'::jsonb,
  'Ancient Greek stone amphitheater with athletic tracks, marble columns, torch-lit archways, dramatic sunset sky, epic scale'
);

-- Add arena_building_id to games_festivals to track which arena hosts
ALTER TABLE games_festivals ADD COLUMN IF NOT EXISTS arena_building_id uuid REFERENCES city_buildings(id);
