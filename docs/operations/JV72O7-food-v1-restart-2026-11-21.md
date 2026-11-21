# JV72O7 — food economy v1 restart (2026-11-21)

## Provenance and reversible cutover

- New active room code: `JV72O7`.
- New session id: `cc237114-a672-4194-baae-7a16c9cf29c4`.
- Prior session id: `d379caff-8992-48e2-9084-7c9d74acceb1`, preserved **intact** with room code `JV72O7-ARCHIVE-20261121`, original turn 23 and all its session-scoped state.
- Original player membership and account authorizations were copied to the new session, not deleted from the old.
- 38 unrelated sessions were left unchanged.
- Cutover consisted only of a two-row transaction on `game_sessions.room_code` and `init_status/current_turn` of the new session.
- **No destructive wipe of the former session**; archive remains an intact rollback target.

## New world state

- Turn 1, `init_status=ready`, `parcel_economy_version=1`.
- 961 macro tiles, 2,916 materialized 6×6 micro tiles, 17 physical cities.
- Player `Lachimovo`: 100 urban population and surrounding rural labor.
- 16 neutral city owners each 200 population, separate city, province, physical civic seat, urban residential district, worked rural source parcel and completed buildings.
- 17 food specializations, 17 rural population entries, 17 municipal capital stocks, 17 owner realm cash accounts; 49 completed buildings (all on parcel contents); 56 fully constructed road segments, one connected land-route network.
- 177 visible player macro tiles around city locations; all 17 cities recorded as known discoveries.
- One-time founding provisions: each city's bakery has 25 units of `preserved_food` and 20 units of `charcoal` declared in `starter_reserve` (the actual `STARTER_RESERVE_GOODS` whitelist) so the canonical first-adoption branch can import them once, never per-turn.
- Ecology of selected sites checked against actual `tile_parcels.sub_biome` and macro `temp_band/moisture_band`, not simply based on display labels; warm forest, humid swamp, desert, temperate and cold regions included.
- Natural marine fishing source seeded with a deterministic private salt that makes `food:marine_fish` at the chosen micro location a **genuine** 28%-chance hit, marked `found`, not a false starter-kit import.

## Specializations

| City | Food map resource | Harvest structure | Main processor |
| --- | --- | --- | --- |
| Lachimovo | wheat | Farma | Mlýn + Pekárna |
| Zlaté Lány | wheat | Farma | Mlýn + Pekárna |
| Ječmenný Brod | barley | Farma | Mlýn + Pekárna |
| Milpa | maize | Farma | Mlýn + Pekárna |
| Rýžová Delta | rice | Rýžoviště | Mlýn + Pekárna |
| Prosná Výspa | sorghum | Farma | Mlýn + Pekárna |
| Čočkovec | lentils | Farma | Mlýn + Pekárna |
| Fazolový Dvůr | common_beans | Farma | Mlýn + Pekárna |
| Hlíznice | potatoes | Farma | Pekárna |
| Taroš | taro | Farma | Pekárna |
| Oliveta | olives | Farma | Lisovna oleje + Pekárna |
| Vinohrad | grapes | Vinice | Vinařství + Pekárna |
| Fíkový Přístav | bananas_plantains | Farma | Udírna a solírna + Pekárna |
| Pastviny | cattle | Farma | Pekárna + Udírna a solírna |
| Ovčín | sheep | Farma | Udírna a solírna + Pekárna |
| Rybné Molo | marine_fish | Rybářství | Udírna a solírna + Pekárna |
| Medový Háj | bees (honey) | Farma | Vinařství + Pekárna |

All 40 available food map resources live in the canonical `supabase/functions/_shared/foodResources.ts` and are NOT all activated on each one-site city; this is intentional capacity specialization.

## Repaired pre-existing blockers

1. `drizzle/migrations/0052_restore_atomic_parcel_occupancy.sql`: restored production `occupy_city_parcel_atomic`, security definer, service-role-only. Idempotent occupied-parcel call returned `already:true` in independent DB verification.
2. `drizzle/migrations/0053_food_honey_meat_labels.sql`: honey `food_honey` produced by bee colonies, not edible beehives; slaughtered animal goods labeled meat. Existing `food_bees` retained only as nonedible legacy key.
3. New-world admin-only neutral seeder source: `supabase/functions/_shared/neutralCitySeeder.ts`; opt-in hook in `world-generate-init/index.ts` (not deployed at this cutover; this instance was seeded in a scoped database transaction).
4. `scripts/jv72o7_food_restart_road_network.sql` captures 56 initial built transport links.

## Independent database verification

```sql
SELECT id,room_code,current_turn,init_status
FROM game_sessions WHERE room_code IN ('JV72O7','JV72O7-ARCHIVE-20261121');

SELECT owner_player,count(*) as cities,sum(population_total) as urban_population
FROM cities WHERE session_id=(SELECT id FROM game_sessions WHERE room_code='JV72O7')
GROUP BY owner_player ORDER BY owner_player;

SELECT count(*) AS physical_buildings
FROM city_buildings WHERE session_id=(SELECT id FROM game_sessions WHERE room_code='JV72O7')
  AND parcel_id IS NOT NULL AND status='completed';

SELECT count(*) AS food_specializations
FROM food_specializations WHERE session_id=(SELECT id FROM game_sessions WHERE room_code='JV72O7');

SELECT count(*) AS roads
FROM road_segments WHERE session_id=(SELECT id FROM game_sessions WHERE room_code='JV72O7')
  AND status='completed';
```

## Rollback — no row deletion

Requires an administrator, a no-active-turn precondition, and no conflicting room codes.
```sql
BEGIN;
UPDATE game_sessions SET room_code='JV72O7-RESET-20261121-ROLLED-BACK'
WHERE id='cc237114-a672-4194-baae-7a16c9cf29c4'
  AND room_code='JV72O7';
UPDATE game_sessions SET room_code='JV72O7'
WHERE id='d379caff-8992-48e2-9084-7c9d74acceb1'
  AND room_code='JV72O7-ARCHIVE-20261121';
COMMIT;
```

## Explicit remaining limitations

- No authenticated browser smoke test or real end-to-end `process-turn` run was performed on the new live game; schema/foreign-key, ledger whitelists, physical building placement, valid recipe graph and route connectivity **were** independently verified.
- Lovable workspace is out of credits: the new generic neutral-city seeder and new-world hook in GitHub have not been deployed as edge functions. **This does not negate the direct database seeding of the current JV72O7 instance**.
- Autonomous city policies (construction/expansion/diplomacy/war) are deliberately outside v1 and still unimplemented.
- City exchange needs dynamic confirmation in actual turns; full economic calibration, wage circulation, housing and famine balance must be observed from `economy_turn_ledgers` after play.
- Player may need to reopen by *room code* JV72O7 because the session UUID changed; the previous session UUID still points to the preserved archive.
