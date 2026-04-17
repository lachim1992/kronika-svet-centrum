

User potvrdil v3 jako merge-worthy. Žádné nové korekce — pouze tvrdé podmínky disciplíny pro implementaci. Plán je beze změny scope; doplním explicitně jen disciplinární podmínky, které user vyjmenoval, aby byly v plánu zaznamenané a vynutitelné při implementaci.

# Konsolidační plán v3 — final (s disciplinárními podmínkami)

## Disciplinární podmínky (závazné při implementaci)

1. **`recompute-all` = boundary layer.** Pouze: delegate → adapt response → optional `process-turn(recalcOnly)`. Žádná business logika, žádný vlastní step list, žádné nové výpočty.
2. **Top-level `ok`** se odvozuje **výhradně** z reálných kroků (`refresh-economy` + volitelný `process-turn`). Warnings step (`ok: true`) **nesmí** zamaskovat selhání jiných kroků.
3. **`useGameSession` split** musí mít **viditelné markery**: bloková hlavička `// LEGACY COMPAT`, `@deprecated` JSDocs, TODO blok. Bez markerů = jen rename = sabotáž.
4. **DEPRECATION.md** musí mít **5 oddělených kategorií** (seed / runtime write / editor API / read-only UI / prop-threading). Žádná obecná sekce „writers".
5. **`ontology.md`** popisuje **realitu repa**, ne target model. Spekulace pouze v sekci "Target model (follow-up)".
6. **`README.md`** = technický entrypoint. Žádný pitch, žádné lore, žádné vize.

---

## 1. `supabase/functions/recompute-all/index.ts` → defenzivní wrapper

- Header komentář: účel, NE kanonický, jen back-compat adapter pro DevTab.
- Body: `{ sessionId, playerName? }` (camelCase).
- Delegate `refresh-economy` s `{ session_id: sessionId }`.
- **Defenzivní adapter:**
  - `steps` chybí/není array → `[]` + `ok: false`
  - `totalMs` fallback z `Σ durationMs`
  - `detail` bezpečně stringify
  - mapovat `{ name → step, ok, durationMs, detail }`
- **Warnings jako syntetický step:**
  ```ts
  if (warnings?.length) adaptedSteps.push({
    step: "refresh-economy warnings",
    ok: true, durationMs: 0,
    detail: warnings.join("\n"),
  });
  ```
- Pokud `playerName` → `process-turn` (`recalcOnly: true`) jako další reálný krok.
- **Top-level `ok` = `refreshSteps.every(ok) && (processTurnStep?.ok ?? true)`** — warnings step se ignoruje pro `ok` výpočet.
- Vrátit `{ ok, totalMs, steps }` — kontrakt beze změny.

## 2. `src/hooks/useGameSession.ts` — izolace bez rename

- **Bloková hlavička** nad `fetchLegacyCompat`:
  ```
  // ============================================
  // LEGACY COMPAT — see DEPRECATION.md
  // Tables: player_resources, military_capacity, trade_log
  // Realtime subscriptions removed; fetch-only.
  // Do not extend. Migrate consumers to realm_resources.
  // ============================================
  ```
- Interní split:
  - `fetchCore()` — `game_sessions`, `game_players`, `cities`
  - `fetchLegacyCompat()` — `player_resources`, `military_capacity`, `trade_log`
  - `fetchSessionData()` — orchestrátor (přejmenovat z `fetchAll` → pravdivější)
- `initPlayerResources()` — **bez rename**, JSDoc `@deprecated` + inline compat komentář.
- `updateResource()` — JSDoc `@deprecated`.
- **TODO blok** nahoře v souboru:
  ```
  // TODO (consolidation, see DEPRECATION.md):
  // - remove legacy reads after LeaderboardsPanel migration
  // - remove initPlayerResources after seed flow migration
  // - remove `resources` from public hook API last
  ```
- Veřejné API hooku beze změny.

## 3. `DEPRECATION.md` — granulární exekuční checklist

Přidat **5 explicitních kategorií** (nahradit současnou obecnou sekci):

- **Seed paths** (bootstrap-time inserts):
  - `useGameSession.initPlayerResources` (createGameSession/joinGameSession)
  - `WorldSetupWizard.tsx`
  - `MyGames.tsx`
  - `dev/SeedSection.tsx`
- **Runtime writers** (turn-time, aktivně drží legacy ontologii):
  - `process-turn` edge function (back-compat write)
  - `dev/EconomyQASection.tsx`
- **Editor APIs**:
  - `useGameSession.updateResource`
  - `dev/DevPlayerEditor.tsx` (`saveResource`)
- **Read-only UI consumers**:
  - `LeaderboardsPanel`, `AdminMonitorPanel`, `EmpireOverview`
- **Write-path UI consumers**:
  - `EmpireManagement`
- **Prop-threading only** (snadná migrace):
  - `GameHubFAB`, `CouncilTab`, `CivTab`, `WorldTab`, `CodexTab`

**Order of dismantling:** read-only → read-heavy → editor APIs → seed paths → runtime writer → drop table.

Bez konkrétních dat (vlastník deadlinů je user).

## 4. `docs/architecture/ontology.md` (nový, deskriptivní)

**Canonical (doložené v repu):**
- State: `game_sessions`, `game_players`, `cities`, `realm_resources`, `province_routes`, `flow_paths`, `city_market_baskets`, `province_nodes`, `node_inventory`
- Projection: `chronicle_entries`, `world_memories`, `wiki_entries`
- Orchestrace ekonomiky: `refresh-economy` (snake_case), chain `compute-province-routes` → `compute-hex-flows` → `compute-economy-flow` → `compute-trade-flows`
- Back-compat adapter: `recompute-all` (camelCase, NE kanonický)

**Not canonical (explicit sekce):**
- `player_resources`, `military_capacity`, `trade_log`
- UI props nesoucí legacy resources
- Veškerý odvozený narativní text (sagas, rumors, advisor copy)

**Target model (follow-up, neověřeno čtením kódu v této session):**
- Event sourcing přes `game_events` + `command-dispatch` + `commit-turn` (per `mem://tech/event-sourcing-architecture`)
- Per-resource sloupce na `realm_resources`
- Septanda/rumors tabulky

**AI grounding rule:** odkaz na `mem://constraints/narrative-grounding` — AI nikdy negeneruje čísla.

## 5. `docs/architecture/feature-freeze.md` (nový, deklarativní)

- **Core (vývoj povolen):** session, economy refresh, turn processing, chronicle/history persistence, core UI read model.
- **Frozen 4–6 týdnů (jen bug fixes):** leagues, games (sport), extra rumors, AI lore generators (saga, history-synthesize), portraits, world-crisis, manual world/lore generators.
- Bez runtime feature flagů.

## 6. `README.md` — technický entrypoint

Struktura, žádný pitch:
1. **What it is** — 1 odstavec (z `mem://project/purpose`)
2. **Stack** — 1 odstavec (React/Vite/TS/Tailwind/shadcn + Lovable Cloud)
3. **Architecture entry points** — odkazy:
   - `docs/architecture/ontology.md`
   - `docs/architecture/feature-freeze.md`
   - `DEPRECATION.md`
   - `docs/economy-v4.3-architecture.md`
4. **Development workflow** — krátký Lovable odkaz nakonec

---

## Soubory v commitu

| Soubor | Akce |
|---|---|
| `supabase/functions/recompute-all/index.ts` | Defenzivní wrapper + adapter + warnings step + header |
| `src/hooks/useGameSession.ts` | Split, `fetchSessionData`, markery, `@deprecated`, TODO blok |
| `DEPRECATION.md` | 5-kategoriální checklist + order of dismantling |
| `docs/architecture/ontology.md` | **Nový**, deskriptivní + "Not canonical" sekce |
| `docs/architecture/feature-freeze.md` | **Nový**, deklarativní |
| `README.md` | Stručný technický entrypoint |

## Mimo scope

- ❌ Rename `initPlayerResources`
- ❌ Migrace UI konzumentů
- ❌ DB migrace
- ❌ Odstranění `resources` z hooku
- ❌ Změny v dalších edge funkcích
- ❌ Runtime feature flagy
- ❌ Jakákoliv business logika v `recompute-all` mimo delegate/adapt

