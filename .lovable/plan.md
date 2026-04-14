

# Task 1A: Fix critical runtime issues in compute-trade-flows

## Scope
Single file only: `supabase/functions/compute-trade-flows/index.ts`  
No basket model changes. No UI changes. Pure backend reliability fix.

## Issues identified

### Issue 1 — Missing Supabase client initialization
`createClient` is imported (line 1) but `sb` is never declared. Used from line 102 onward for every DB query. Function cannot execute.

**Fix**: Add after line 98:
```typescript
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

### Issue 2 — Undefined `existing` variable (line 389)
In bonus-supply-per-basket aggregation, `existing` is referenced without declaration. Must get-or-initialize from `basketAgg`.

**Fix**: Insert before line 389:
```typescript
const existing = basketAgg.get(bk) || { quantity: 0, qualitySum: 0, count: 0 };
```

### Issue 3 — Add structured remap counters
Update `resolveBasketKey` to accept a counter object (`{ unmapped, legacy }`) tracked independently from warning text. Update all call sites to pass the counter.

### Issue 4 — Include counters in response JSON
```json
{
  "ok": true,
  "version": "v4.3",
  "baskets_count": 12,
  "unmapped_count": 0,
  "legacy_remap_count": 5,
  "warnings": ["..."]
}
```

## Constraints
- Keep existing fallback behavior (`staple_food`) unless required for fix
- No stateEffect/routeEffect application
- No other files touched

