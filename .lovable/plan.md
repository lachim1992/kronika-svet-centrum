

User schválil plán, přidal jedno zpřesnění smoke harness reportu (uložit failure context: turn#, player, session id, realm_resources row id/count). Integruji a finalizuji.

# Beta Stabilization Update — final lock

## Pořadí
1. **A** — `docs/BETA_SCOPE.md` + README pointer
2. **C** — Demote EmpireManagement za `useDevMode`
3. **B** — EmpireOverview adapter + rewire na kanonický model
4. **D** — 30-turn smoke harness

## Stream A
- `docs/BETA_SCOPE.md` (1 strana): in scope (1 session, 1 realm, 30 turns, kanonický loop), out of scope (persistent tick, ligy/sport, lore-heavy, admin/editor jako player UI, MP>2), kanonický tah, source-of-truth pointers.
- `README.md`: 1-line link na BETA_SCOPE.

## Stream C
- `CitiesTab.tsx`: AccordionItem "Správa říše" obalit `{devMode && ...}`.
- `EmpireManagement.tsx`: JSDoc `@deprecated Legacy editor surface. Not part of beta player loop.`
- `updateResource` zůstává funkční. Žádný rewrite.

## Stream B
- **`src/lib/empireOverviewAdapter.ts`** (nový) s headerem: `// Beta view-model adapter — NOT a canonical ontology mapping.`
  - Mapping: `gold_reserve→gold`, `grain_reserve→food`, wood/stone/iron/horses/labor analogicky.
  - **Hard rule**: chybějící income/upkeep vrací `undefined`, NIKDY 0.
  - Armády: agregát z `military_stacks`, ne `MilitaryCapacity[]`.
  - Schema gaps explicitní v `// TODO:` komentářích.
- **`EmpireOverview.tsx`**: props `realmResource: RealmResource | null` + `militaryStacks: MilitaryStack[]`. Render: `value !== undefined ? format(value) : "—"`. Žádný `value || 0`.
- **`WorldTab.tsx`**: pass canonical inputs.
- **`useGameSession.ts`**: verify/expose `realmResources` + `military_stacks` v `fetchCore` (jen pokud chybí).

## Stream D
- **`src/components/dev/BetaSmokeHarness.tsx`** (nový), gated `useDevMode`, mount v `DevTab`.
- Tlačítko "Run 30-turn smoke". Per turn: snapshot → `commit-turn` → `refresh-economy` → re-fetch → invariants.
- **Invariants:**
  - session loads, commit-turn ok, refresh-economy ok all 4 steps
  - adapter validní view-model (NaN = fail; undefined v income/upkeep = OK)
  - chronicle count monotonic non-decreasing
  - `fetchLegacyCompat` nehází
  - **unique** `realm_resources` row pro hráče
  - **reserve sanity**: gold/grain/wood/stone/iron/horses/labor `>= 0` (záporné = warning, ne fail)
  - **turn monotonicity**: `current_turn_after === current_turn_before + 1`
- **Failure report (per user)**: při prvním failu uložit `{ turn_number, player_name, session_id, realm_resources_row_id, realm_resources_row_count, stack }` aby šel bug reprodukovat bez znovuhrání 30 tahů.

## Soubory
| Stream | Soubor | Akce |
|---|---|---|
| A | `docs/BETA_SCOPE.md` | New |
| A | `README.md` | 1-line pointer |
| C | `src/pages/game/CitiesTab.tsx` | Gate accordion |
| C | `src/components/EmpireManagement.tsx` | JSDoc demotion |
| B | `src/lib/empireOverviewAdapter.ts` | New |
| B | `src/components/EmpireOverview.tsx` | Rewire props, `—` pro undefined |
| B | `src/pages/game/WorldTab.tsx` | Canonical inputs |
| B | `src/hooks/useGameSession.ts` | Expose realm_resources/military_stacks (jen pokud chybí) |
| D | `src/components/dev/BetaSmokeHarness.tsx` | New |
| D | `src/pages/game/DevTab.tsx` | Mount harness |

## NEDĚLÁ
❌ Schema migrace · ❌ LeaderboardsPanel · ❌ EmpireManagement rewrite · ❌ Removal `player_resources`/`initPlayerResources`/`updateResource` · ❌ Process-turn změny · ❌ Mapa/AI/onboarding · ❌ CI

## Po tomto updatu
Vyhodnotit smoke report → rozhodnout LeaderboardsPanel migraci → removal decision.

