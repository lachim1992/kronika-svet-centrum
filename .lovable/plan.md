

# Inkrement 3 — Premise-First (FINAL LOCK v2)

User má pravdu ve všech 3 bodech. Doplním D1-D3 + A (advanced unlock semantics) + B (warning codes).

## Δ proti předchozímu locku

### D1: Create gating (tvrdé)
```ts
createDisabled = !resolved || isSuggestionStale || isBlueprintStale
```
Žádný implicit resync v create flow. Hráč musí kliknout "Regenerovat blueprint" než smí Create.

**Acceptance #14 update:** Create button disabled pokud `resolved===null || isSuggestionStale || isBlueprintStale`.

### D2: Blueprint regeneration = full translate s hard non-blueprint lock
Tlačítko "Regenerovat blueprint" volá `translate-premise-to-spec` s tímto payloadem, sestaveným klientem:
```ts
{
  premise,
  userOverrides: pickNonBlueprintFields(state.resolved), 
    // worldName, size, tone, victoryStyle, style, factionCount, terrain.*
  lockedPaths: ALL_NON_BLUEPRINT_LEAF_PATHS, 
    // konstanta v worldgenSpecPaths.ts
  regenerationNonce: state.regenerationNonce + 1,
}
```
Server respektuje locks v promptu + **vždy hard-merge** override po AI návratu (M4). Výsledek: změní se prakticky jen `geographyBlueprint` (+ deterministicky se posune seed).

Helper `composeBlueprintRegenRequest(state)` v `worldBootstrapPayload.ts`.

**Nové acceptance #18:** Blueprint regeneration nemění non-blueprint fields (test: snapshot resolved před/po, diff jen v `geographyBlueprint` a `seed`).

### D3: Lock canonicalization (leaf-only)
- `lockedPaths: string[]` v state (serializace, equality)
- runtime `lockedPathSet = useMemo(() => new Set(state.lockedPaths), [state.lockedPaths])` pro lookup
- **Lockable paths whitelist** (konstanta `LOCKABLE_LEAF_PATHS`):
  - `worldName`
  - `size`
  - `tone`
  - `victoryStyle`
  - `style`
  - `factionCount`
  - `terrain.targetLandRatio`
  - `terrain.mountainDensity`
  - `terrain.continentShape`
  - `terrain.continentCount`
- Žádné parent paths (`terrain`, `geographyBlueprint`) — reducer odmítne lock mimo whitelist
- Žádné duplicity — reducer dedupliuje při insertu

**Nové acceptance #19:** Lock akce mimo `LOCKABLE_LEAF_PATHS` jsou no-op; `lockedPaths` neobsahuje duplicity ani parent paths.

### A: Advanced override unlock = jen managed fields
Advanced panel má vlastní konstantu `ADVANCED_MANAGED_PATHS`:
- `size`, `style`, `victoryStyle`, `factionCount`, `terrain.targetLandRatio`, `terrain.mountainDensity`, `terrain.continentShape`, `terrain.continentCount`

Switch ON: lockne všechny `ADVANCED_MANAGED_PATHS` na aktuální values (bulk lock).
Switch OFF: unlockne **jen ty paths, které byly locknuty advancem**. Ručně locknuté pole (přes inline editor) zůstávají.

Implementace: reducer drží `lockedBy: Map<path, "user" | "advanced">` jako interní detail (nebo separátní set `advancedLockedPaths`). Persistence: jen `lockedPaths`, attribution se ztrácí mezi sessions (akceptovatelné pro MVP).

**Nové acceptance #20:** Advanced switch OFF nezruší user-locknutá pole; switch ON nepřepíše hodnoty pole, které už user lockl.

### B: Warning codes (lehká strukturovanost)
```ts
type TranslateWarning = {
  code: "GENERIC_PREMISE" | "FACTIONS_INFERRED_CONSERVATIVELY" 
      | "BIOME_WEIGHTS_NORMALIZED" | "RANGE_CLAMPED" | "OVERRIDE_APPLIED";
  message: string;
  field?: string;
};
```
UI v Inkrementu 3 jen vypíše `message`, code je připraven pro budoucí targeting.

## Doplněné soubory

| Soubor | Akce |
|---|---|
| `src/lib/worldgenSpecPaths.ts` | + `LOCKABLE_LEAF_PATHS`, `ADVANCED_MANAGED_PATHS`, `ALL_NON_BLUEPRINT_LEAF_PATHS`, `pickNonBlueprintFields(spec)`, `canonicalizeLocks(paths)` |
| `src/lib/worldBootstrapPayload.ts` | + `composeBlueprintRegenRequest(state)` |
| `src/hooks/useWorldSetupWizardState.ts` | reducer drží `advancedLockedPaths: string[]` separátně; akce `LOCK_FIELD` validuje proti whitelist; `ADVANCED_TOGGLE` bulk lock/unlock jen managed paths |
| `src/components/world-setup/BlueprintStaleWarning.tsx` | tlačítko volá `composeBlueprintRegenRequest` |

Ostatní soubory beze změny vůči předchozímu locku.

## Acceptance criteria — finální set (1-20)

**UX základ (1-6):** beze změny

**Lock & merge (7-10):** beze změny

**Stale & konzistence (11-14):** #14 update viz D1

**Bezpečnost & determinismus (15-17):** beze změny

**Doplněné (18-20):**
- 18: Blueprint regen mění jen `geographyBlueprint` + `seed`; non-blueprint fields zůstávají
- 19: Lock akce mimo whitelist = no-op; `lockedPaths` canonicalized (no dup, no parent)
- 20: Advanced switch OFF nezruší user-locknutá pole; switch ON nepřepíše už locknuté hodnoty

## Implementační pořadí (uzamčené)

1. Typy + paths infra (`worldgenSpecPaths.ts` vč. whitelistů a `pickNonBlueprintFields`)
2. Backend `translate-premise-to-spec` + shared validation
3. State reducer (`useWorldSetupWizardState`) vč. `advancedLockedPaths`
4. Inspirace karty + PremiseAnalyzer (premise + Analyzovat)
5. SpecReviewSummary + SpecFieldEditor (top-level + terrain leaf editors)
6. BlueprintStaleWarning + regen wiring
7. Preview wiring (čte `resolved`, blokované při stale)
8. Create wiring (D1 gating)
9. AdvancedTerrainPanel refactor (managed paths, A semantics)
10. Cleanup: delete PresetCards, worldPresets, useWizardDirtyState

## NEDĚLÁ
❌ Inline edit blueprint nested polí · ❌ Auto-analyze · ❌ Removal `generate-geo-blueprint` (deprecate only) · ❌ Změna `create-world-bootstrap` API · ❌ Persistence `lockedBy` attribution · ❌ Captcha · ❌ Localizace warning messages · ❌ Separátní endpoint pro blueprint regen (re-use translate-premise-to-spec přes D2)

## Tím je locked
- D1 ✓ create gating tvrdé
- D2 ✓ blueprint regen kontraktně definovaný
- D3 ✓ lockedPaths leaf-only, canonicalized, string[] s memoized Set
- A ✓ advanced unlock respektuje user-lockované pole
- B ✓ warnings mají code

