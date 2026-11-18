# Migration reconciliation — not applied

This directory contains forward-only SQL prepared under the explicit constraint that this iteration must not migrate the production database.

## Verified repository and live-schema findings

- `0016_atomic_urban_parcel_purchase.sql` exists and the live database already exposes `buy_city_parcel(uuid,uuid,text,uuid,integer)` as a security-definer function. Its tag is absent from `drizzle/migrations/meta/_journal.json`.
- `0023_fix_rural_site_recipe_guard.sql` is an unregistered duplicate with a malformed `SELECT IF1` statement. The corrected and registered `0024_fix_rural_site_recipe_guard.sql` is the canonical version; the live trigger matches the corrected behavior.
- Live `validate_tile_parcel_content_capacity()` already locks the parcel row and checks capacity, and its trigger is active. This rule is absent from the migration history, so a clean installation would not reproduce the live behavior.
- Migration-history inspection also reports `snapshot_missing` for `0025_rural_households_and_atomic_founding`. The file was introduced without a snapshot in commit `ae80174e`; adding only the two unlisted tags would therefore not repair a clean installation.
- The inspection returned no safe repair plan. Historical migration files and the platform-owned journal were not edited manually.

## Prepared candidate

`0038_atomic_parcel_occupancy.sql` is idempotent forward-only SQL for:

- parcel-row locking and capacity checks, including one-slot worked parcels;
- session validation and positive slot counts;
- canonical `city_buildings.parcel_id` ↔ `tile_parcel_contents` linkage;
- atomic `occupy_city_parcel_atomic()` ownership/link/content writes;
- explicit legacy status of the single-entity `tile_parcels.building_id` and `district_id` projections.

It is intentionally not registered or applied in this iteration. The matching command-dispatch change and PostgreSQL tests are ready, but deploying that command before applying this SQL would fail closed with a missing-RPC error.

## Required separately authorized reconciliation

Use the platform migration-history/migration workflow to create a real migration and snapshot, reconcile the missing 0025 snapshot and register the idempotent replacement. Do not register malformed 0023 and do not rewrite old SQL. Existing databases already containing any of these functions must end with the same definitions as a clean installation. No production schema or game-data change is authorized by this document.
