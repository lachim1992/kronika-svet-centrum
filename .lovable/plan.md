
# Inkrement 3 — Final lock v9

Po auditu kódu je důležité upřesnění: většina V8 je zatím stále jen ve specifikaci, ne v implementaci. `WorldSetupWizard.tsx` pořád běží na legacy local state, `useWorldSetupWizardState` ještě neexistuje a `worldgenSpecPaths.ts` stále obsahuje staré `ALL_NON_BLUEPRINT_LEAF_PATHS` včetně `seed`. Takže další krok je stále správně specifikačně uzamknout a pak to implementovat atomicky.

## Poslední blocker

### G5: Freeze editoru při `isBusy=true`
User má pravdu. `requestId` guard řeší jen outdated response, ne edit stejného request snapshotu během letu.

**Tvrdé pravidlo:**
Když běží analyze nebo blueprint regen, editor je read-only.

```ts
const isAnalyzing = state.activeAnalyzeRequestId !== null;
const isRegeneratingBlueprint = state.activeBlueprintRegenRequestId !== null;
const isBusy = isAnalyzing || isRegeneratingBlueprint;
```

**Disabled při `isBusy`:**
- premise textarea
- inspiration cards
- inline field editory
- lock/unlock akce
- advanced override controls
- analyze button
- regen button
- create button

Tím odpadá potřeba `editorRevision` pro MVP a každá úspěšná odpověď vždy odpovídá stále platnému snapshotu editoru.

### Nové acceptance #26
Během aktivního analyze nebo blueprint regen requestu nelze měnit premise ani overrides; všechny editory a lock controls jsou disabled. Úspěšná odpověď tedy vždy odpovídá stabilnímu snapshotu stavu.

## Finální lock v9

### Zůstává
- kanonický namespace `userIntent.*`
- leaf-only lock paths
- `seed` mimo blueprint regen lock set
- `terrain.biomeWeights.*` uvnitř regen lock setu
- `resolved` mimo reducer
- `isBusy` derived z request IDs
- `REGENERATE_BLUEPRINT_FAIL`
- discard outdated responses přes `requestId`
- create disabled při `!resolved || isSuggestionStale || isBlueprintStale || isBusy`
- regen disabled při `!resolved || isSuggestionStale || isBusy`

### Přesné soubory k implementaci
1. `src/lib/worldgenSpecPaths.ts`
   - `ALL_NON_BLUEPRINT_LEAF_PATHS` → `BLUEPRINT_REGEN_LOCK_PATHS`
   - `pickNonBlueprintFields` → `pickBlueprintRegenLockedFields`
   - přidat `terrain.biomeWeights.*`
   - vyhodit `seed`
   - přidat invariant komentář
2. `src/lib/worldBootstrapPayload.ts`
   - `composeBlueprintRegenRequest` na nový whitelist/helper
3. `src/hooks/useWorldSetupWizardState.ts`
   - nový reducer hook
   - bez `resolved` a bez `analyzing`
   - request IDs + stale flags + `analyzeError` + `blueprintRegenError`
4. `src/components/WorldSetupWizard.tsx`
   - přepojit z legacy local state na nový hook
   - **freeze všech editorů při `isBusy`**
5. `src/components/world-setup/AdvancedTerrainPanel.tsx`
   - přijímat `disabled`
   - respektovat managed-path semantics
6. nové UI části
   - `PremiseAnalyzer`
   - `SpecReviewSummary`
   - `SpecFieldEditor`
   - `SpecLockBadges`
   - `BlueprintStaleWarning`
7. backend kontrola
   - `supabase/functions/translate-premise-to-spec/index.ts`
   - `supabase/functions/_shared/worldgen-spec-validation.ts`
   - `supabase/functions/create-world-bootstrap/index.ts`
   - ověřit autoritativní použití dodaného `geographyBlueprint`

## Implementační pořadí
1. Path infra + rename + biome lock paths
2. Reducer hook + request lifecycle + derived busy state
3. Analyze / regen orchestrace s `requestId`
4. UI freeze při `isBusy`
5. Summary/editory/locky
6. Preview wiring z `resolved`
7. Create wiring + bootstrap kontrakt
8. Cleanup legacy preset/dirty-state flow

## Acceptance finální set
- 1–25: beze změny
- **26 nové:** editor freeze při `isBusy`

## Tím je locked
- G5 ✓ in-flight edits už nemohou zneplatnit přijatou odpověď
- MVP zůstává jednoduché: žádný `editorRevision`, žádné částečné aplikace odpovědí

