
CREATE TABLE IF NOT EXISTS public.city_capital_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  stock numeric NOT NULL DEFAULT 0,
  last_delta numeric NOT NULL DEFAULT 0,
  last_turn integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, city_id)
);
GRANT SELECT ON public.city_capital_stock TO authenticated;
GRANT ALL ON public.city_capital_stock TO service_role;
ALTER TABLE public.city_capital_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session members read city capital" ON public.city_capital_stock FOR SELECT TO authenticated
  USING (public.is_session_member(session_id, auth.uid()));
CREATE TRIGGER update_city_capital_stock_updated_at BEFORE UPDATE ON public.city_capital_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Catalog cleanup: extraction without inputs is a SOURCE, tools are operational (not household).
UPDATE public.production_recipes SET required_role='source' WHERE recipe_key IN ('draw_water','cut_peat');
UPDATE public.goods SET friction_profile = friction_profile || '{"household": false}'::jsonb WHERE key='metalwork_tools';

-- Rice is its own staple, not generic raw_grain, and needs water.
INSERT INTO public.goods (key, display_name, category, production_stage, market_tier, base_price_band, base_price_numeric, demand_basket, substitution_map, storable, description, friction_profile)
SELECT 'raw_rice','Rýže','food','raw','mass',0,0.7,'staple_food','{"staple_food":0.6}'::jsonb,true,'Loupaná rýže, jí se vařená bez mlýna','{"final_use":true,"household":false,"substitutability":0.6}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.goods WHERE key='raw_rice');
UPDATE public.production_recipes SET output_good_key='raw_rice' WHERE recipe_key='harvest_rice';

UPDATE public.building_templates t SET
  effects = jsonb_set(t.effects,'{recipe_keys}',(SELECT coalesce(jsonb_agg(k),'[]') FROM jsonb_array_elements(t.effects->'recipe_keys') k WHERE k <> '"harvest_rice"')),
  level_data = (SELECT jsonb_agg(jsonb_set(l,'{effects,recipe_keys}',(SELECT coalesce(jsonb_agg(k),'[]') FROM jsonb_array_elements(l->'effects'->'recipe_keys') k WHERE k <> '"harvest_rice"'))) FROM jsonb_array_elements(t.level_data) l)
WHERE t.name='Farma';

INSERT INTO public.building_templates (name, category, description, cost_wood, cost_stone, cost_iron, cost_wealth, build_turns, required_settlement_level, effects, max_level, level_data)
SELECT 'Rýžoviště','economic','Zavlažovaná rýžová pole u řeky nebo pobřeží.',20,5,0,15,2,'HAMLET',
 '{"recipe_keys":["harvest_rice"],"basket_outputs":{"staple_food":5},"requires_water":true,"capability_tags":["farming"],"production_roles":["source"]}'::jsonb,3,
 '[{"name":"Rýžoviště","level":1,"unlock":null,"cost_mult":1,"effects":{"recipe_keys":["harvest_rice"],"basket_outputs":{"staple_food":5},"capability_tags":["farming"],"production_roles":["source"]}},
   {"name":"Terasová pole","level":2,"unlock":null,"cost_mult":2,"effects":{"recipe_keys":["harvest_rice"],"basket_outputs":{"staple_food":5},"capability_tags":["farming"],"production_roles":["source"]}},
   {"name":"Zavlažovací soustava","level":3,"unlock":null,"cost_mult":4,"effects":{"recipe_keys":["harvest_rice"],"basket_outputs":{"staple_food":5},"capability_tags":["farming"],"production_roles":["source"]}}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.building_templates WHERE name='Rýžoviště');
