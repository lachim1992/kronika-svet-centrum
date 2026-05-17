-- Phase 1: Buildings → Goods Economy v4.3 integration
-- 1) Add explicit recipe_bonus / building_bonus columns to city_market_baskets
ALTER TABLE public.city_market_baskets
  ADD COLUMN IF NOT EXISTS recipe_bonus   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_bonus numeric NOT NULL DEFAULT 0;

-- 2) Deterministic, idempotent seed of building_templates.effects.basket_outputs
WITH defaults AS (
  SELECT * FROM (VALUES
    (10,  'bakery',     jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 6))),
    (20,  'mill',       jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 4))),
    (30,  'granary',    jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 4, 'staple_food', 2))),
    (40,  'weaver',     jsonb_build_object('basket_outputs', jsonb_build_object('basic_clothing', 5))),
    (50,  'silk',       jsonb_build_object('basket_outputs', jsonb_build_object('luxury_clothing', 4))),
    (60,  'armory',     jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 4, 'metalwork', 1))),
    (70,  'arsenal',    jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 5))),
    (80,  'forge',      jsonb_build_object('basket_outputs', jsonb_build_object('tools', 5, 'metalwork', 2))),
    (90,  'smithy',     jsonb_build_object('basket_outputs', jsonb_build_object('tools', 4))),
    (100, 'lumberyard', jsonb_build_object('basket_outputs', jsonb_build_object('fuel', 6, 'construction', 2))),
    (110, 'woodcutter', jsonb_build_object('basket_outputs', jsonb_build_object('fuel', 5))),
    (120, 'aqueduct',   jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 10))),
    (130, 'well',       jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 6))),
    (140, 'warehouse',  jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 6))),
    (150, 'chancell',   jsonb_build_object('basket_outputs', jsonb_build_object('admin_supplies', 4))),
    (160, 'scriptorium',jsonb_build_object('basket_outputs', jsonb_build_object('admin_supplies', 3))),
    (170, 'stonecutter',jsonb_build_object('basket_outputs', jsonb_build_object('construction', 5))),
    (180, 'barracks',   jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 3))),
    (190, 'winery',     jsonb_build_object('basket_outputs', jsonb_build_object('feast', 5))),
    (200, 'tavern',     jsonb_build_object('basket_outputs', jsonb_build_object('feast', 4))),
    (210, 'pekár',      jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 6))),
    (220, 'mlýn',       jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 4))),
    (230, 'sýpk',       jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 4, 'staple_food', 2))),
    (240, 'tkal',       jsonb_build_object('basket_outputs', jsonb_build_object('basic_clothing', 5))),
    (250, 'ková',       jsonb_build_object('basket_outputs', jsonb_build_object('tools', 5, 'metalwork', 2))),
    (260, 'studn',      jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 6))),
    (270, 'lázn',       jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 8))),
    (280, 'sklad',      jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 6))),
    (290, 'kasár',      jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 3)))
  ) AS t(priority, pat, patch)
),
matched AS (
  SELECT
    bt.id,
    d.patch,
    ROW_NUMBER() OVER (PARTITION BY bt.id ORDER BY d.priority ASC) AS rn
  FROM public.building_templates bt
  JOIN defaults d
    ON LOWER(COALESCE(bt.name, '')) LIKE '%' || d.pat || '%'
  WHERE NOT (COALESCE(bt.effects, '{}'::jsonb) ? 'basket_outputs')
)
UPDATE public.building_templates bt
SET effects = COALESCE(bt.effects, '{}'::jsonb) || matched.patch
FROM matched
WHERE bt.id = matched.id
  AND matched.rn = 1;