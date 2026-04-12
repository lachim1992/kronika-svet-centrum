

# Economy v4.2 Stabilization — Final Implementation Plan

## Critical bug confirmed

**`recompute-all` is broken.** It sends `{ sessionId }` (camelCase) but all 4 sub-functions destructure `{ session_id }` (snake_case):
- `compute-province-routes` line 86: `const { session_id } = await req.json()`
- `compute-hex-flows` line 30: `const { session_id, force_all, player_name } = await req.json()`
- `compute-economy-flow` line 306: `const { session_id, turn_number, save_history } = await req.json()`
- `compute-trade-flows` line 53: `const { session_id, turn_number } = await req.json()`

Every step has been silently returning 400 errors.

## Military upkeep mismatch confirmed

- **Backend** (`process-turn` lines 415-422): `unit_count * 0.004` (grain), `unit_count * 0.003` (wealth)
- **Frontend** (`economyConstants.ts`): `ceil(manpower / 100)` for gold, `ceil(manpower / 500)` for food — reads `military_stack_composition[].manpower`

Two different models, two different data sources.

---

## 7 changes in order

### 1. Create `supabase/functions/refresh-economy/index.ts`

Safe 4-step orchestrator (same `invokeStep` pattern as `recompute-all`):
1. `compute-province-routes` → `{ session_id }`
2. `compute-hex-flows` → `{ session_id, force_all: true }`
3. `compute-economy-flow` → `{ session_id }`
4. `compute-trade-flows` → `{ session_id }`

No `process-turn`. Best-effort in-memory per-session guard (returns 409 if already running). `ok: true` only if all 4 steps pass. Returns `{ ok, session_id, totalMs, refreshed_domains, steps[], warnings[] }`.

### 2. Fix `recompute-all/index.ts` payload keys

Lines 70-73: Change `{ sessionId }` → `{ session_id: sessionId }` and `{ sessionId, force_all: true }` → `{ session_id: sessionId, force_all: true }` for all steps including the process-turn step (`{ session_id: sessionId, playerName, recalcOnly: true }` stays as-is since process-turn reads `playerName` directly).

### 3. Update `HomeTab.tsx` recompute handler (lines 249-264)

Replace `compute-economy-flow` invocation with `refresh-economy`. Pass `{ session_id: sessionId }`. Toast logic:
- Success: "Ekonomika přepočítána — 4 kroky, {totalMs}ms"
- Partial fail: "Přepočet selhal ve kroku {name}. Stav nemusí být konzistentní."
- 409: "Přepočet již probíhá" (info toast, not error)

Remove deficit node alert from alerts array (line 247).

### 4. Update `EconomyTab.tsx` recompute handler (lines 180-195)

Same change as HomeTab.

### 5. Align military upkeep (`economyConstants.ts` + `MilitaryUpkeepPanel.tsx`)

- `computeArmyGoldUpkeep`: read `stack.unit_count`, multiply by `0.003`. Fallback to composition sum if missing.
- `computeArmyFoodUpkeep`: read `stack.unit_count`, multiply by `0.004`. Same fallback.
- `MilitaryUpkeepPanel`: display `unit_count` per stack, update formula text to match backend multipliers.

### 6. Remove v3 sections from `HomeTab.tsx`

- Lines 481-497: deficit/surplus node count summary
- Line 513: `<NodeFlowBreakdown>` component
- Lines 516-536: macro economy 3-col grid (production/wealth/capacity bars)
- Lines 538-547: "Celková důležitost" section

### 7. Minimal `EconomyTab.tsx` cleanup

- Remove lines 348-393: "Tok dle rolí" collapsible (v3 role-flow)
- Hide "Produkce" card from macro summary row (line 241) — keep only Bohatství, Zásoby, Kapacita
- Add empty state to `DemandFulfillmentPanel` and `MarketSharePanel`: when 0 data rows, show "Tržní data nejsou k dispozici — klikněte na Přepočítat ekonomiku."
- Add small "Ekonomika v4.2" badge at bottom of EconomyTab

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/refresh-economy/index.ts` | **New** |
| `supabase/functions/recompute-all/index.ts` | Fix payload keys |
| `src/pages/game/HomeTab.tsx` | Recompute → refresh-economy; remove v3 sections |
| `src/pages/game/EconomyTab.tsx` | Recompute → refresh-economy; remove role flow; hide Produkce |
| `src/lib/economyConstants.ts` | Military upkeep → unit_count × 0.003/0.004 |
| `src/components/economy/MilitaryUpkeepPanel.tsx` | Update formulas + data source |
| `src/components/economy/DemandFulfillmentPanel.tsx` | Empty state banner |
| `src/components/economy/MarketSharePanel.tsx` | Empty state banner |

## Acceptance criteria

1. HomeTab "Přepočítat" calls `refresh-economy` with `session_id`
2. EconomyTab "Přepočítat" calls same function
3. Success toast only on 4/4 steps passing
4. Partial fail toast names the failed step
5. 409 response shows info toast, no success
6. Military upkeep numbers match backend (`unit_count × 0.003/0.004`)
7. No v3 role-flow, surplus/deficit counts, or macro production bars in UI
8. MarketShare and Demand panels show data or explicit empty state
9. All 4 invoked edge functions receive correct `session_id` payload key
10. `recompute-all` no longer produces 400s from sub-functions due to key mismatch

