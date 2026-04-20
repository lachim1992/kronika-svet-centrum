

# Beta Hardening — Sprint 1 (v9 — final locked)

## Změny proti v8
1. Destructuring gate: multiline-safe `rg -U -P` místo jednořádkového `grep -E`
2. Runtime acceptance: rozšířena o existing session open + reload + tab switch

Vše ostatní z v8 beze změny.

## Krok 0 — Verify + doc sync
- Grep FE (SQL + symbols) + BE (writers/seeders) odděleně
- Schema check `realm_resources` (STOP pokud chybí pole)
- 3 allowlist artefakty: `legacy-allowlist.md`, `legacy-allowlist-files.txt` (FE), `legacy-backend-inventory.txt` (BE Sprint 2)
- Doc sync `legacy-writer-audit.md` + `DEPRECATION.md` s `Last verified` HNED

## Krok 1 — Backend runtime writes cut
- `process-turn/index.ts` ~1445–1475: drop `player_resources` write
- `command-dispatch/index.ts`: drop wealth stockpile sync

## Krok 2 — Seed paths cut (verified subset)
- `useGameSession.ts::createGameSession`/`joinGameSession`: drop `initPlayerResources()`
- `MyGames.tsx` + `WorldSetupWizard.tsx`: jen pokud Krok 0a potvrdí

## Krok 3 — `useGameSession` core/legacy split
- `fetchLegacyCompat()` mimo initial load AND refetch
- Initial = `fetchCore()` + `fetchContent()`
- Legacy přes nový opt-in `useGameSessionLegacy()`
- `resources`/`armies`/`trades` v public API: `@deprecated` JSDoc

## Krok 4 — WorldTab + EmpireOverview smoke-check
- WorldTab: drop `resources?`/`armies?` props
- EmpireOverview: verify-only, adapter polish

## Krok 5 — HomeTab redukce
- Max 5–6 player signal karet
- Drop `province_nodes`, `nodeStats`, `cityNodeMap`
- Shared data z `useGameSession`

## Krok 6 — EconomyTab split (separátní dev modul)
- Drop `armies` prop
- Vyextrahovat `EconomyTabDevPanels.tsx` + `useEconomyTabDevData.ts`
- `realm_resources` z `useGameSession`, ne lokální fetch
- Dev panely lazy, žádný top-level import

## Krok 7 — Smoke + scope sync
- `BETA_SCOPE.md`: `fetchLegacyCompat does not throw` → `useGameSessionLegacy() (opt-in) does not throw`
- `BetaSmokeHarness.tsx`: legacy compat assertion přepojit na opt-in hook
- Final doc sync

## Search-based acceptance

```
# 1. SQL legacy mimo allowlist (FE)
grep -rln "from('player_resources')\|from('military_capacity')\|from('trade_log')" src/ \
  | grep -v -f docs/architecture/legacy-allowlist-files.txt \
  | grep -v "src/components/dev/"
# Expected: 0

# 2. Symbol legacy mimo allowlist
grep -rln "\bPlayerResource\b\|\bMilitaryCapacity\b\|\binitPlayerResources\b" src/ \
  | grep -v -f docs/architecture/legacy-allowlist-files.txt
# Expected: 0

# 3. useGameSessionLegacy import gate
grep -rln "useGameSessionLegacy" src/ \
  | grep -v -f docs/architecture/legacy-allowlist-files.txt \
  | grep -v "src/hooks/"
# Expected: 0

# 4a. Deprecated dot-notation
grep -rln "useGameSession()" src/ | while read f; do
  grep -l "\.resources\b\|\.armies\b\|\.trades\b" "$f"
done | grep -v -f docs/architecture/legacy-allowlist-files.txt
# Expected: 0

# 4b. Deprecated destructuring — MULTILINE SAFE (v9 oprava)
rg -l -U -P "const\s*\{[\s\S]*?\b(resources|armies|trades)\b[\s\S]*?\}\s*=\s*useGameSession\s*\(" src/ \
  | grep -v -f docs/architecture/legacy-allowlist-files.txt
# Expected: 0
# Fallback pokud rg není k dispozici:
# grep -rlzP "const\s*\{[^}]*\b(resources|armies|trades)\b[^}]*\}\s*=\s*useGameSession\s*\(" src/

# 5. HomeTab
grep -nE "province_nodes|nodeStats|cityNodeMap|from\('realm_resources'\)|from\('military_stacks'\)" src/pages/game/HomeTab.tsx
# Expected: 0

# 6a. EconomyTab
grep -nE "from\('province_nodes'\)|from\('realm_resources'\)" src/pages/game/EconomyTab.tsx
# Expected: 0
grep -nE "^import.*\b(NodeFlowBreakdown|FormulasReferencePanel|GapAdvisorPanel|EconomyDependencyMap|CapacityPanel)\b" src/pages/game/EconomyTab.tsx
# Expected: 0

# 6b. Dev module import gate
grep -rln "EconomyTabDevPanels\|useEconomyTabDevData" src/ \
  | grep -vE "src/pages/game/EconomyTab\.tsx|src/components/economy/EconomyTabDevPanels\.tsx|src/hooks/useEconomyTabDevData\.ts|src/components/dev/"
# Expected: 0
```

**Backend (inventář, Sprint 2):**
```
grep -rln "from('player_resources')\|initPlayerResources" supabase/functions/ | sort > /tmp/be-actual.txt
diff /tmp/be-actual.txt docs/architecture/legacy-backend-inventory.txt
# Expected: žádné nové soubory
```

## Runtime acceptance (v9 rozšíření)

**Scénář A — new session:**
1. Create new session
2. 3 turns
3. Network panel: 0 GET na `player_resources`/`military_capacity`/`trade_log`

**Scénář B — existing session + reload + tab switch (nový):**
1. Otevřít existující session (initial load path)
2. Reload stránky (ověřit, že initial `fetchSessionData` nevolá legacy)
3. 1–2 turns (refetch path)
4. Přepnout Home → World → Economy → zpět
5. Network panel: 0 GET na `player_resources`/`military_capacity`/`trade_log` v celém průběhu

**Smoke:** `BetaSmokeHarness` projde s upraveným kontraktem.

## Component-level acceptance
1. `process-turn` + `command-dispatch` nezapisují do `player_resources`
2. Create/join nezakládá `player_resources` rows
3. `useGameSession` initial load AND refetch nevolají `fetchLegacyCompat()`
4. `useGameSessionLegacy()` importovaný JEN allowlist
5. `resources`/`armies`/`trades` z default `useGameSession` mimo allowlist = 0 (dot + multiline destructuring)
6. WorldTab props bez `resources`/`armies`
7. EmpireOverview smoke-check pass
8. HomeTab: max 6 karet, 0 `province_nodes`, 0 lokální canonical fetch, 0 top-level dev imports
9. EconomyTab: bez `armies`, dev modul vyextrahován, 0 lokální canonical/node fetch, 0 top-level dev imports
10. `EconomyTabDevPanels` + `useEconomyTabDevData` importované JEN z povolených surfaces
11. `BETA_SCOPE.md` + `BetaSmokeHarness` sladěné s opt-in legacy
12. Existující sessions fungují
13. 3 allowlist artefakty existují a odpovídají mainu

## Mimo Sprint 1
| Sprint | Scope |
|---|---|
| 2 | BE seedery cut + AI faction registration audit |
| 2 | City Stress Vector v `process-turn` |
| 3 | 4-cluster UI reorg |
| 3 | `EmpireManagement` + `LeaderboardsPanel` + `AdminMonitorPanel` migrace |
| 4 | Cascade deleter → DROP TABLE `player_resources` |
| 4 | Observatory badging |
| 5+ | `military_capacity` → `military_stacks` only |

## Tvrdá pravidla
- ❌ Žádný nový sloupec v `realm_resources`
- ❌ Žádné nové mechaniky
- ❌ Žádné cuty mimo allowlist bez grep důkazu
- ✅ Doc sync nejdřív (Krok 0), kód potom
- ✅ EmpireOverview = smoke-check
- ✅ EconomyTab dev modul separátní s import-gate
- ✅ Deprecated API gate pokrývá dot + multiline destructuring
- ✅ FE a BE acceptance oddělené
- ✅ Runtime acceptance pokrývá create, open, reload i tab switch

