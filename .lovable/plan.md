

User schválil v3 a přidal 4 hard requirements: idempotency, bootstrap status, seed determinism, parity check. Zapracuji je do finálního locku. Žádná inspekce nepotřebná — celý design už je odsouhlasený, jen doplňuji safeguards.

# Unified World Bootstrap v1 — final lock (s 4 safeguards)

## Pre-requisite
BETA Gate v3 v mainu + smoke 2× zelený.

## Implementační kroky (nezměněno + 4 doplňky)

### Krok 1: DB migrace
`world_foundations` doplnit:
- `worldgen_spec jsonb`
- `worldgen_version integer DEFAULT 1`
- `bootstrap_status text DEFAULT 'pending'` — enum-like: `pending | bootstrapping | ready | failed`
- `bootstrap_error text` — diagnostic message při `failed`
- GIN index na `worldgen_spec`
- CHECK constraint na `bootstrap_status` hodnoty

### Krok 2: Sdílené typy
`_shared/world-bootstrap-types.ts` + `_shared/world-sizes.ts` dle v3. `BootstrapStatus` přidat do typu.

### Krok 3: Edge function `create-world-bootstrap`

**Idempotency guard (krok 0, před vším):**
```ts
const existing = await sb
  .from("world_foundations")
  .select("id, bootstrap_status, worldgen_spec")
  .eq("session_id", payload.sessionId)
  .maybeSingle();

if (existing?.bootstrap_status === "ready") {
  return Response.json({
    ok: true,
    alreadyBootstrapped: true,
    sessionId: payload.sessionId,
    worldgen: { /* z existing.worldgen_spec */ },
  });
}
if (existing?.bootstrap_status === "bootstrapping") {
  return Response.json({ ok: false, error: "Bootstrap already in progress" }, { status: 409 });
}
```

**Status transitions:**
- Step 0: nastavit `bootstrap_status = 'bootstrapping'` (atomicky s upsert world_foundations)
- Step 8: nastavit `bootstrap_status = 'ready'`
- Catch: nastavit `bootstrap_status = 'failed'` + `bootstrap_error = String(err)`

**Seed determinism v `normalizeBootstrapRequest()`:**
```ts
const seed = payload.world.seed?.trim() || crypto.randomUUID();
// Seed se propaguje do spec.seed a všech downstream volání (generate-world-map)
```

**Parity check po map generation (step 5):**
```ts
if (mapResp.mapWidth !== spec.resolvedSize.width || mapResp.mapHeight !== spec.resolvedSize.height) {
  throw new Error(`Size parity violation: spec=${spec.resolvedSize.width}x${spec.resolvedSize.height}, map=${mapResp.mapWidth}x${mapResp.mapHeight}`);
}
// Při upsert world_foundations: map_width/height = spec.resolvedSize.{width,height}
```

`config.toml`: `[functions.create-world-bootstrap]` `verify_jwt = false`.

### Krok 4: Demote `world-generate-init`
Refactor: jen AI seeding (volaný ze `runModeSpecificSeeding('tb_single_ai')`).
**Legacy guard:** `world-generate-init` v legacy flow **nesmí** zapisovat `worldgen_spec` ani `bootstrap_status`. Zůstává plně beze změny chování pro flag OFF path.

### Krok 5: Klient feature flag
`WorldSetupWizard.tsx`:
- `VITE_USE_UNIFIED_BOOTSTRAP` env flag (default OFF)
- ON: jeden submit `create-world-bootstrap`
- OFF: legacy větvení beze změny
- UI cleanup až Inkrement 3

## Soubory

| Krok | Soubor | Akce |
|---|---|---|
| 1 | `supabase/migrations/<ts>_worldgen_bootstrap.sql` | NEW |
| 2 | `supabase/functions/_shared/world-bootstrap-types.ts` | NEW |
| 2 | `supabase/functions/_shared/world-sizes.ts` | NEW |
| 3 | `supabase/functions/create-world-bootstrap/index.ts` | NEW |
| 3 | `supabase/config.toml` | +1 block |
| 4 | `supabase/functions/world-generate-init/index.ts` | Refactor: AI seeding only |
| 5 | `src/types/worldBootstrap.ts` | NEW (re-export) |
| 5 | `src/components/WorldSetupWizard.tsx` | +flag, alternativní path |

## Acceptance criteria

**Statické (1–4):**
1. Nová hra s flag ON = 1 backend call do `create-world-bootstrap`
2. `world_foundations.worldgen_spec` validní `WorldgenSpecV1` pro každou bootstrapnutou hru
3. `world.size` deterministicky určí mapW/mapH; `advancedOverride.enabled=true` přepíše
4. Stejný seed + stejný payload → identický `worldgen_spec` (a identická mapa, je-li engine deterministic)

**Runtime (5–7):**
5. 4 nové hry (po jedné v každém `mode`) → všechny `bootstrap_status='ready'`, žádný step `ok: false`
6. Legacy flow (flag OFF) beze změny chování; nezapisuje `worldgen_spec` ani `bootstrap_status`
7. Smoke harness 30 turns na bootstrapnuté hře = zelený

**Safeguards (8–10) — nově:**
8. **Idempotency:** druhý call `create-world-bootstrap` na `bootstrap_status='ready'` session → vrátí `alreadyBootstrapped: true`, žádné duplikáty. Call na `bootstrapping` → 409.
9. **Status transition:** každý run zanechá `bootstrap_status` v `{ready, failed}`; `bootstrapping` nesmí přežít konec requestu.
10. **Parity:** `world_foundations.map_width = worldgen_spec.resolvedSize.width` (a height). Mismatch = throw.

## NEDĚLÁ
❌ Prompt → bias translator · ❌ Změna `terrain.ts` · ❌ Map preview · ❌ Persistent-tick refactor · ❌ Tabulka `worldgen_runs` · ❌ Removal starých funkcí · ❌ UI cleanup ve Wizardu · ❌ Migrace existujících her · ❌ Změna canonical turn loop

## Po Inkrementu 1
- Jeden kanonický bootstrap entrypoint za feature flagem
- Strukturovaný + idempotent + status-tracked worldgen
- worldSize deterministic master input s parity guarantee
- Připraveno na Inkrement 2 (translator) a 3 (UI flip + legacy removal)

