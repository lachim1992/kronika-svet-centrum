# Wave 1 — AI Cost Control (Final)

Cíl: snížit AI burn bez změn gameplaye. Pouze telemetrie, model downgrade a throttly. Reverzibilní, žádné DB schema změny, žádné UI změny, žádné odebírání feature.

## Soubory

- `supabase/functions/_shared/ai-context.ts` — telemetrie + `logAISkip` helper
- `supabase/functions/ai-faction-turn/index.ts` — model selection podle warState/crisis
- `supabase/functions/commit-turn/index.ts` — throttly pro wiki-enrich, player-chronicle, world-history

Ostatní funkce (`world-chronicle-round`, `rumor-generate`, `chronicle`, `citystates`, `extract-*`) **se neupravují**.

## 1) Telemetrie v `_shared/ai-context.ts`

Rozšíření `AIInvokeOptions` o nepovinná pole `purpose?: string` a `auto?: boolean`.

V `invokeAI` před fetch na gateway přidat compact log:
```
[ai-call] fn=<functionName> purpose=<purpose|unknown> session=<sessionId> player=<civContext.playerName|unknown> model=<model> input_chars=<sys+user> auto=<auto|unknown>
```
Po úspěšném parse:
```
[ai-done] fn=<functionName> model=<model> output_chars=<n>
```

Nový exportovaný helper:
```ts
export function logAISkip(fn: string, target: string, reason: string, meta: Record<string, any> = {}) { ... }
// → [ai-skip] fn=<fn> target=<target> reason=<reason> key=val ...
```

Žádné fulltext promptů/outputů do logu. Existující `logAIInvocation` (DB) zůstává.

## 2) `ai-faction-turn` — Pro pouze pro highStakes

Nahradit hardcoded `"google/gemini-2.5-pro"` (na všech volacích místech v této funkci) za:
```ts
const highStakes =
  milMetrics.warState === "war" ||
  milMetrics.warState === "tension" ||
  (tensions || []).some((t: any) => t.crisis_triggered);
const factionModel = highStakes ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";
```
Použít v `invokeAI({ model: factionModel })` i v `model_used` polích telemetrie. Action schema, decision logic, prompts — beze změny.

## 3) Wiki-enrich cooldown (`commit-turn`)

Ve smyčce přes `enrichTargets`, kde se už načítá `lastEnriched`, přidat early-skip:
```ts
if (lastEnriched && (closedTurnForRefs - lastEnriched) < 3) {
  logAISkip("commit-turn", "wiki-enrich", "cooldown",
    { entity: entityId, last: lastEnriched, turn: closedTurnForRefs });
  continue;
}
```
**První enrichment (lastEnriched null/0) NENÍ blokován.** Existující guardy (impact_score, min_events, hasTriggerEvent) zůstávají.

## 4) Player-chronicle throttle (`commit-turn`)

Před vstup do smyčky generování player-chronicle:
```ts
const PLAYER_CHRONICLE_EVERY = 3;
const hasMajorPlayerEvent =
  confirmedEvents.some((e: any) =>
    e.truth_state === "canon" ||
    ["battle","conquest","wonder_built","founding","disaster","famine"].includes(e.event_type)
  ) || battles.length > 0;
const shouldRunPC = (closedTurn % PLAYER_CHRONICLE_EVERY === 0) || hasMajorPlayerEvent;

if (!shouldRunPC) {
  logAISkip("commit-turn", "player-chronicle", "throttle", { turn: closedTurn });
} else {
  // existing per-player loop
}
```

## 5) World-history throttle (`commit-turn`) — opraveno dle feedbacku

```ts
const isEpoch = closedTurn % 10 === 0;
const hasCanonOrBattle = canonEvents.length > 0 || battles.length > 0;

if (!isEpoch && !hasCanonOrBattle) {
  logAISkip("commit-turn", "world-history", "not_epoch_no_major", { turn: closedTurn });
} else {
  // existing world-history invoke + insert
}
```

World-history běží **pouze když**: `closedTurn % 10 === 0` ∨ `canonEvents.length > 0` ∨ `battles.length > 0`. Jinak skip.

## 6) Skip behavior

Skipy nikdy nehází throw. Vždy jen jednořádkový `[ai-skip]` log. Ostatní fáze `commit-turn` pokračují normálně.

## Acceptance criteria

1. Každé volání AI Gateway přes `invokeAI` produkuje právě jeden `[ai-call]` log s `fn`, `model`, `input_chars`.
2. `ai-faction-turn` v míru → `google/gemini-2.5-flash`. Ve `war` / `tension` / `crisis_triggered` → `google/gemini-2.5-pro`.
3. Wiki-enrich neběží pro entitu obohacenou v posledních <3 tazích. **První enrichment není blokován.**
4. Player-chronicle běží jen každý 3. tah, pokud není major event (canon ∨ battle ∨ conquest ∨ wonder ∨ founding ∨ disaster ∨ famine).
5. World-history běží jen když `turn % 10 === 0` ∨ `canonEvents > 0` ∨ `battles > 0`. Jinak skip.
6. Žádné UI změny, žádné DB schema změny. `rumor-generate`, `world-chronicle-round`, `ai-faction-turn` features nedotčeny.
7. **Smoke test — 3 mírové tahy bez bitev/canon eventů:**
   - `ai-faction-turn`: `model=google/gemini-2.5-flash` ve všech 3 tazích.
   - `player-chronicle`: max 1× za 3 tahy (na `turn % 3 === 0`); jinak `[ai-skip] target=player-chronicle reason=throttle`.
   - `world-history`: 0 spuštění (3× `[ai-skip] target=world-history reason=not_epoch_no_major`).
   - `wiki-enrich`: první enrichment proběhne; opakovaný enrichment téže entity v <3 tazích → `[ai-skip] reason=cooldown`.

## Očekávaný dopad per turn

| Volání | Před | Po |
|---|---|---|
| ai-faction-turn (per faction) | gemini-2.5-pro | flash v míru, pro jen war/tension/crisis |
| player-chronicle (per player) | každý turn | ~1/3 turnů (nebo major event) |
| world-history | prakticky každý turn | pouze epoch ∨ canon ∨ battle |
| wiki-enrich (per entity) | bez cooldownu | min. 3-turn cooldown po 1. enrichmentu |
| world-chronicle-round, rumor-generate, ostatní | beze změny | beze změny |

Hrubý odhad úspory na klidném turnu: **−60 až −75 %** AI nákladů. Na válečném turnu: **−30 až −40 %**.

## Mimo scope (Wave 2 dle telemetrie)

- `extract-civ-identity` / `extract-traits` early-return guardy
- Zkrácení `world-chronicle-round` outputu + top-K kontextu
- Hybrid `ai-faction-turn` (engine vybírá akci, AI jen flavor v míru)
- Engine fallback pro `citystates`
- Per-session AI budget cap
- Deprecate legacy `chronicle` funkce
