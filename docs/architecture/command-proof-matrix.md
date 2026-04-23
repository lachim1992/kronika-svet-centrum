# Command Proof Matrix — 13 Sprint-A Commands

> **Evidence header**
> - Repo snapshot: main @ 2026-04-23
> - Authority: Normative. Overrides `.lovable/plan.md` on conflict.

## Execution Model

**All 13 Sprint-A commands are executed via typed RPC (target: PL/pgSQL functions).**

`command-dispatch` Edge Function is a pure orchestrator: validate session → call RPC → return result.
`set_config('app.current_command_id', ...)` is the audit context propagation mechanism within RPCs, NOT a decision boundary for whether RPCs exist.

## Idempotency Contract

### Sprint A (current): Best-effort pre-check

At top of `executeCommand`, before any mutations:
```typescript
const { data: existing } = await supabase
  .from("game_events").select("id, event_type, command_id")
  .eq("command_id", commandId);
if (existing?.length > 0) return { events: existing, idempotent: true };
```
**This is explicitly a mitigation, not transactional idempotency.** Two simultaneous requests can pass this check. Full closure requires Sprint B.

### Sprint B (target): Transactional gate inside RPC

```sql
INSERT INTO game_events (..., command_id) VALUES (..., p_command_id)
ON CONFLICT (command_id) WHERE command_id IS NOT NULL DO NOTHING;
IF NOT FOUND THEN RETURN jsonb_build_object('idempotent', true); END IF;
```

## Canonical vs Cosmetic Fields — `military_stacks`

### Canonical (must go through command path)
`is_active`, `formation_type`, `general_id`, `morale`, `power`, `demobilized_turn`, `remobilize_ready_turn`, `hex_q`, `hex_r`, `moved_this_turn`, `is_deployed`

### Cosmetic (exempt from command path)
`image_url`, `image_prompt`, `image_confirmed`, `sigil_url`, `sigil_confirmed`, `army_sigil_url`, `army_sigil_confirmed`

## Command Table

| # | Command | Class | Tables Mutated | Cost Source | Forbidden Client Write |
|---|---|---|---|---|---|
| 1 | FOUND_CITY | Complex | cities, world_events, wiki_entries, province_hexes, discoveries | none (free) | cities.insert |
| 2 | RECRUIT_STACK | Complex | military_stacks, military_stack_composition, realm_resources | gold_reserve | military_stacks.insert, realm_resources.update |
| 3 | REINFORCE_STACK | Medium | military_stack_composition, realm_resources | gold_reserve, manpower_committed | military_stack_composition.update/insert, realm_resources.update |
| 4 | UPGRADE_FORMATION | Medium | military_stacks, realm_resources | gold_reserve | military_stacks.update, realm_resources.update |
| 5 | ASSIGN_GENERAL | Simple | military_stacks (×2) | none | military_stacks.update |
| 6 | DISBAND_STACK | Medium | military_stacks, realm_resources | none (returns) | military_stacks.update, realm_resources.update |
| 7 | DEMOBILIZE | Medium | military_stacks (×N), realm_resources | none (returns) | military_stacks.update, realm_resources.update |
| 8 | REMOBILIZE_STACK | Medium | military_stacks, realm_resources | manpower_committed | military_stacks.update, realm_resources.update |
| 9 | SET_MOBILIZATION | Simple | realm_resources | none | realm_resources.update |
| 10 | BUILD_BUILDING | Medium | city_buildings, realm_resources | production_reserve, gold_reserve | city_buildings.insert, realm_resources.update |
| 11 | UPGRADE_SETTLEMENT | Medium | cities, realm_resources | production_reserve, gold_reserve | cities.update, realm_resources.update |
| 12 | ENACT_DECREE | Medium | realm_resources, cities (stability delta) | varies by decree | realm_resources.update, cities.update |
| 13 | MOVE_STACK | Simple | military_stacks | none | military_stacks.update |

## Acceptance Grep Gates

```bash
# No client-side canonical writes to realm_resources
grep -rEn '\.from\(.realm_resources.\)\.(insert|update|delete)' \
  src/pages/ src/components/ \
  | grep -v 'dev/' \
  | grep -v -f docs/architecture/direct-write-deferred-files.txt
# Expected: 0

# No client-side canonical writes to military tables
grep -rEn '\.from\(.military_stacks.\)\.(insert|update|delete)' \
  src/pages/ src/components/ \
  | grep -v 'dev/' \
  | grep -v -f docs/architecture/direct-write-deferred-files.txt
# Expected: 0

# No client-side canonical writes to city_buildings
grep -rEn '\.from\(.city_buildings.\)\.(insert|update|delete)' \
  src/pages/ src/components/ \
  | grep -v 'dev/' \
  | grep -v -f docs/architecture/direct-write-deferred-files.txt
# Expected: 0
```
