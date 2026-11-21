-- Food resources: a bee colony is the natural resource; honey is the harvested trade good.
-- Food livestock goods are carcass/meat outputs from slaughter, not the animals still alive.
-- Non-destructive: retain food_bees as a legacy key but prohibit its household final-use.
INSERT INTO public.goods (key,display_name,category,production_stage,market_tier,base_price_band,
  base_price_numeric,demand_basket,storable,friction_profile,substitution_map)
SELECT 'food_honey','Med',category,production_stage,market_tier,base_price_band,
       base_price_numeric,demand_basket,storable,friction_profile,substitution_map
FROM public.goods WHERE key='food_bees'
ON CONFLICT (key) DO UPDATE SET display_name='Med',
 friction_profile=jsonb_set(public.goods.friction_profile,'{final_use}','true'::jsonb);
UPDATE public.goods SET display_name='Včelstva (legacy – nespotřebovávat)',
 friction_profile=jsonb_set(friction_profile,'{final_use}','false'::jsonb)
WHERE key='food_bees';
UPDATE public.production_recipes SET output_good_key='food_honey'
WHERE recipe_key='harvest_food_bees' AND output_good_key='food_bees';
UPDATE public.production_recipes SET input_items=jsonb_set(input_items,'{0,key}','"food_honey"'::jsonb)
WHERE recipe_key='ferment_mead' AND input_items->0->>'key'='food_bees';
UPDATE public.goods AS g SET display_name=v.label
FROM (VALUES
 ('food_cattle','Hovězí maso'),
 ('food_sheep','Skopové maso'),
 ('food_goats','Kozí maso'),
 ('food_pigs','Vepřové maso'),
 ('food_chickens','Kuřecí maso'),
 ('food_ducks_geese','Maso vodní drůbeže')
) AS v(key,label)
WHERE g.key=v.key AND g.display_name IS DISTINCT FROM v.label;
