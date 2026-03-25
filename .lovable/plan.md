

# Fix: Foreign key violation when building nodes

## Problem
When building a node (e.g. Major "Hrad"), if `provinceId` is `null`, the code inserts `"00000000-0000-0000-0000-000000000000"` as `province_id`. This UUID doesn't exist in the `provinces` table, causing a FK constraint violation.

## Fix

### `src/components/BuildNodeDialog.tsx`
1. **Before inserting**, look up the province that owns the target hex by querying `province_hexes` for the hex at `(hexQ, hexR)` in the current session — use its `province_id`.
2. If still no province found, show an error toast ("Tento hex nemá přiřazenou provincii") and abort — don't insert with a fake UUID.
3. Change line 112 from the fake fallback to the resolved province ID.

### Technical detail
```typescript
// Before insert, resolve province from hex
let resolvedProvinceId = provinceId;
if (!resolvedProvinceId) {
  const { data: hexData } = await supabase
    .from("province_hexes")
    .select("province_id")
    .eq("session_id", sessionId)
    .eq("q", hexQ)
    .eq("r", hexR)
    .maybeSingle();
  resolvedProvinceId = hexData?.province_id;
}
if (!resolvedProvinceId) {
  toast.error("Tento hex nemá přiřazenou provincii");
  return;
}
```
Then use `resolvedProvinceId` in the insert.

