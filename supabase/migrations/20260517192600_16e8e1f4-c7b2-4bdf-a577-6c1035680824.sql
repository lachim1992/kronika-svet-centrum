
-- Seed basket_outputs for Czech-named building templates (canonical 12 baskets)
DO $$
DECLARE
  mapping jsonb := '{
    "Farma": {"staple_food": 5},
    "Pila": {"construction": 4, "fuel": 2},
    "Důl": {"metalwork": 4, "construction": 1},
    "Manufaktura": {"tools": 3, "basic_clothing": 2},
    "Mincovna": {"admin_supplies": 3},
    "Tržiště": {"storage_logistics": 3},
    "Přístav": {"storage_logistics": 5},
    "Sklárna": {"luxury_clothing": 2, "construction": 2},
    "Chrám": {"admin_supplies": 2, "feast": 2},
    "Klášter": {"admin_supplies": 3},
    "Knihovna": {"admin_supplies": 4},
    "Bardův dům": {"feast": 2},
    "Divadlo": {"feast": 3},
    "Aréna": {"feast": 3},
    "Stadion": {"feast": 3},
    "Soudní dvůr": {"admin_supplies": 4},
    "Akvadukt": {"drinking_water": 8},
    "Kanalizace": {"drinking_water": 4},
    "Most": {"storage_logistics": 2},
    "Silnice": {"storage_logistics": 3},
    "Hradby": {"military_supply": 2},
    "Pevnost": {"military_supply": 4},
    "Strážní věž": {"military_supply": 1},
    "Velitelství": {"military_supply": 4},
    "Obléhací dílna": {"military_supply": 3, "tools": 1},
    "Jízdárna": {"military_supply": 3},
    "Střelnice": {"military_supply": 2}
  }'::jsonb;
  rec record;
BEGIN
  FOR rec IN SELECT key, value FROM jsonb_each(mapping) LOOP
    UPDATE building_templates
    SET effects = COALESCE(effects, '{}'::jsonb) || jsonb_build_object('basket_outputs', rec.value)
    WHERE name = rec.key
      AND NOT (COALESCE(effects, '{}'::jsonb) ? 'basket_outputs');
  END LOOP;
END $$;
