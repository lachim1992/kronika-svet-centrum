# Food resources v1 — canonical catalogue (40 map resources)

Authority: `supabase/functions/_shared/foodResources.ts` (typed, imported by server and UI).
`productionCatalog.ts` derives its food goods/recipes from it; DB sync migration `0048_food_resources_v1`.
The list of 40 is frozen for v1 — extensions add a new version, never edit this list.

## Occurrence model
`present = hash(privateWorldSeed, resource, microXY) < clamp(P0[subBiome] × temp × moisture × water × elevation) × originFactor`
- P0 per sub-biome is the table in `FOOD_RESOURCES` (01 wheat … 40 bees, values from the design brief).
- Climate windows T/M are inclusive bands 0..4; edge band ×0.75, outside = 0 (hard invalid); unknown climate = 0 (fail closed).
- Water: freshwater (river/lake/marsh), saltwater (coast), salt/brackish, groundwater (oasis/river), drinking (herds ×0.5 without water).
- Bananas: max normalized elevation 0.45.
- `originFactor` (worldgen, per region): crops of the Americas/Africa/East-Asia do not appear everywhere merely because climate fits; cities spread them by seed/trade.

## Distinctions (never conflate)
- growing suitability ≠ existing harvested crop; ecological chance ≠ revealed resource;
- wild fauna ≠ domesticated herd; water parcel ≠ buildable parcel (harvest structure stands on an adjacent buildable parcel: shore / harbour_flat / river_bank, rice on fertile_silt / raised_bank / river_bank).

## Chains (existing buildings only)
| Group | Harvest | Processing → final (basket) |
|---|---|---|
| cereals | Farma (rice: Rýžoviště) | Mlýn → flour → Pekárna bake_staples; rice: Mlýn hull_rice → milled_rice (staple_food) |
| legumes | Farma | Mlýn split → pulse_groats → Pekárna cook_pulses → pulse_stew (staple_food); soy/peanut also Lisovna → seed_oil (variety) |
| tubers, squash | Farma | Pekárna cook (charcoal heat) → cooked_tubers; cassava: Mlýn detox_cassava → cassava_meal → Pekárna bake_cassava |
| onions, cabbage, garlic | Farma | Udírna a solírna (heat) → preserved_food |
| bananas, dates | Farma | Udírna dry → dried_fruit (dates sun-dried, no fuel) |
| olives / grapes | Farma / Vinice | Lisovna → olive_oil (variety) / Vinařství → wine_standard (feast) |
| cattle, sheep, goats, pigs, poultry | Farma | Udírna cure → preserved_food; milk_cattle/milk_goats → raw_milk → Pekárna make_cheese → dairy_food; collect_eggs → eggs |
| fish ×3 | Rybářství | Udírna cure → preserved_food |
| bees | Farma | honey (variety, edible) → Vinařství ferment_mead → mead (feast) |

All finals feed existing baskets: 40 products split one need, they never multiply demand.
Raw harvests are not eaten unprocessed (except honey, dates).

## Activation status (v1)
Recipes are attached to existing structures as `specializations` (catalogue) / `effects.specialization_recipe_keys` (DB);
`recipe_keys` that the economy runs today are unchanged. Activation requires phase 3 (one field/herd specialization per site,
herd stocks/reproduction/grazing limits, bee colonies). Until then no session produces the new goods.

## Known gaps
- No salt good yet: preserving uses heat (charcoal) only.
- Worldgen, micro survey, atlas, farm fields, seed catalogue and RECIPE_MICRO_RESOURCE are not yet wired (phase 4).
