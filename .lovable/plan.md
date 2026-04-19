

# NO-GO → GO Beta Gate Fix v3 (locked, with semantic safeguards)

User akceptoval v2 jako rozumný minimální gate fix se třemi zpřesněními. Integruji:
1. Acceptance criteria rozdělit na **patch correctness** vs **runtime stability** (3 vrstvy: instrumentace / flow / důkaz)
2. WarRoomPanel: **semantic audit před mechanickým přepisem typů**
3. Závěr přeformulovat: výsledkem updatu je validní kandidát na GO, ne GO samotné

## Pořadí

1. **Fix A** — Smoke harness payload (instrumentace)
2. **Fix B** — Canonical loop v useNextTurn (flow)
3. **Fix D** — RealmDashboard process-turn gate (flow, blocker)
4. **Fix C** — WarRoomPanel off legacy (player-path leak, s semantickým auditem)

## Fix A — Smoke harness payload

`src/components/dev/BetaSmokeHarness.tsx`, line 101:
- `body: { sessionId }` → `body: { session_id: sessionId }`

1 řádek. Nic víc.

## Fix B — Canonical loop v useNextTurn (non-fatal)

`src/hooks/useNextTurn.ts`: po úspěšném `commit-turn` přidat:
```ts
try {
  const { error: refreshErr } = await supabase.functions.invoke("refresh-economy", {
    body: { session_id: sessionId },
  });
  if (refreshErr) toast.warning("Ekonomika nebyla plně přepočtena.");
} catch (e) {
  console.warn("refresh-economy threw:", e);
}
```
Non-fatal: tah už je commitnutý, refresh je následná konsolidace.

## Fix D — RealmDashboard: zrušit player-visible bypass

`src/components/RealmDashboard.tsx`:
- Tlačítko "Zpracovat kolo" + `handleProcessTurn` gate za `(myRole === "admin" || myRole === "moderator")`
- Stejný pattern jako "Migrovat starý vojenský systém" hned vedle
- Žádný rewrite logiky; `process-turn` zůstane dostupné dev/admin pro debug

## Fix C — WarRoomPanel off legacy (s semantickým auditem)

**Krok 1: Audit před přepisem.** V `WarRoomPanel.tsx` zjistit, co panel z `armies` skutečně čte:
- Pokud jen `armies.filter(a => a.player_name === p.player_name && a.status === "Aktivní").length` (počet aktivních legií per hráč) → **bezpečný mechanický přepis** na `militaryStacks.filter(s => s.owner_player === ...)`.
- Pokud panel čte capacity/strength/upkeep specifické pro `military_capacity` schema → **ne přepisovat slepě**. Buď:
  - degradovat na jednodušší canonical read (jen count + owner),
  - nebo dotčenou sekci panelu schovat za `useDevMode`.

**Krok 2: Mapping (po auditu).**
- `WarRoomPanel.tsx`: prop `armies: MilitaryCapacity[]` → `militaryStacks: MilitaryStack[]`
- Použít `Tables<"military_stacks">` typ
- Agregace: `s.owner_player` místo `a.player_name`; status field zkontrolovat (existuje v `military_stacks`?)

**Krok 3: Konzument.**
- `RealmTab.tsx`: `armies={armies}` → `militaryStacks={militaryStacks}` (už dostupné z useGameSession via Dashboard sharedProps)

**Žádné změny:**
- `WorldTab.tsx` — legacy props deklarované, nečtené (verifikováno) → ponechat
- `CitiesTab.tsx` — legacy v EmpireManagement je dev-gated → ponechat
- `useGameSession` public API — ponechat, legacy fields exponované pro dev/admin surfaces

## Soubory

| Fix | Soubor | Změna |
|---|---|---|
| A | `src/components/dev/BetaSmokeHarness.tsx` | 1 řádek payload key |
| B | `src/hooks/useNextTurn.ts` | +10 řádků refresh-economy non-fatal |
| D | `src/components/RealmDashboard.tsx` | Gate "Zpracovat kolo" za admin/moderator |
| C | `src/components/WarRoomPanel.tsx` | Audit-driven retype + agregace na canonical |
| C | `src/pages/game/RealmTab.tsx` | Prop rewire armies → militaryStacks |

## Acceptance criteria (ve 3 vrstvách)

**Vrstva 1 — Instrumentace (statická):**
1. BetaSmokeHarness skutečně volá `refresh-economy` s payloadem `{ session_id }`. Verifikováno grep + code review.
2. WarRoomPanel typově přijímá `MilitaryStack[]`, ne `MilitaryCapacity[]`. Verifikováno TypeScript compiler.

**Vrstva 2 — Flow (statická + Network tab):**
3. useNextTurn po každém commit-turn invokuje refresh-economy. Verifikováno Network tab: 2 volání/tah.
4. RealmDashboard "Zpracovat kolo" tlačítko **není v DOM** pro role `player`. Verifikováno UI + code review.
5. WarRoomPanel rendered jako player nepoužívá legacy ledger. Verifikováno code review (žádný import `military_capacity`).

**Vrstva 3 — Stabilita (runtime, mimo tento update):**
6. Smoke 30 turns 2× po sobě zelené. **Toto je důkaz GO, ne acceptance tohoto patche.**

## NEDĚLÁ

❌ Audit ostatních tabů nad rámec WarRoomPanel · ❌ useGameSession public API change · ❌ Removal legacy ledgerů (`player_resources`, `military_capacity`, `trade_log`) · ❌ Schema migrace · ❌ process-turn rewrite · ❌ LeaderboardsPanel migrace

## Po tomto updatu

Výsledkem **není** automatické GO. Výsledkem je **validní kandidát na GO**:
- release gate už nebude architektonicky děravá
- smoke harness konečně měří to, co má
- player nemá bypass canonical loopu
- player-path neteče přes legacy military ledger

Teprve potom má smysl spustit smoke 2× jako reálné GO / NO-GO rozhodnutí. Pokud 2× zelené → GO interní beta playtest. Pokud cokoli červené → failure context (turn#, player, session id, realm_resources row id/count) ukáže přesný bug bez znovuhrání 30 tahů.

