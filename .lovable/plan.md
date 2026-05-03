
# Wave 2 — Increment 1 + 2 only (SHADOW telemetry)

Approved scope: add briefing builder + valid_actions generator and log telemetry. Zero behavior change. Old prompt and old action schema remain active. AI continues to use the existing path.

## What changes

**New files:**

1. `supabase/functions/ai-faction-turn/briefing.ts` — pure function `buildFactionBriefing(input)` returning a compact `Briefing` object (identity, resources, military, diplomacy top 5, problems top 3, opportunities top 3, threats top 3, memory top 5). No DB calls; consumes already-fetched data.

2. `supabase/functions/ai-faction-turn/actions.ts` — `generateValidActions(input)` returning `ValidAction[]` with factories for the 9 baseline action types: `RECRUIT_ARMY`, `BUILD_BUILDING`, `MOVE_ARMY`, `ATTACK_TARGET`, `FORTIFY_NODE`, `REPAIR_ROUTE`, `OPEN_TRADE_WITH_NODE`, `ANNEX_NODE`, `HOLD_POSITION` (always emitted as fallback). Each action has `action_id`, `type`, `label`, `params`, `cost`, `expected`, `score (0–100)`. Pre-conditions enforced: only emit if affordable + valid target exists.

**Edited file:**

3. `supabase/functions/ai-faction-turn/index.ts` — add **after** the existing `invokeAI` call (so AI flow is untouched), within a single `try { ... } catch` so a shadow failure never breaks the turn:

```ts
// Wave 2 SHADOW — telemetry only, do not consume.
try {
  const briefing = buildFactionBriefing({ /* pass already-fetched vars */ });
  const validActions = generateValidActions({ briefing, milMetrics, cities,
    strategicNodes, strategicRoutes, supplyStates, affordableBuildings,
    realmRes, resources, factionName });
  const briefingChars = JSON.stringify(briefing).length;
  const currentPromptChars = systemPrompt.length + userPrompt.length;
  const ratio = currentPromptChars > 0 ? briefingChars / currentPromptChars : 0;
  const top5 = [...validActions].sort((a, b) => b.score - a.score).slice(0, 5)
    .map(a => `${a.type}:${a.score}`);
  const hasHold = validActions.some(a => a.type === "HOLD_POSITION");
  const hasEcoOrDef = validActions.some(a => ["BUILD_BUILDING","FORTIFY_NODE","REPAIR_ROUTE","OPEN_TRADE_WITH_NODE"].includes(a.type));
  const hasMilOrDip = validActions.some(a => ["RECRUIT_ARMY","MOVE_ARMY","ATTACK_TARGET","ANNEX_NODE"].includes(a.type));

  if (validActions.length === 0) {
    console.error(`[ai-shadow] ERROR fn=ai-faction-turn faction=${factionName} valid_actions_count=0 turn=${turn} state=${milMetrics.warState}`);
  } else {
    console.log(`[ai-shadow] fn=ai-faction-turn faction=${factionName} turn=${turn} state=${milMetrics.warState} current_chars=${currentPromptChars} briefing_chars=${briefingChars} ratio=${ratio.toFixed(3)} valid_actions=${validActions.length} top5=[${top5.join(",")}] has_hold=${hasHold} has_eco_def=${hasEcoOrDef} has_mil_dip=${hasMilOrDip}`);
  }
} catch (e) {
  console.error(`[ai-shadow] threw fn=ai-faction-turn faction=${factionName}: ${(e as Error).message}`);
}
```

## Files modified

- `supabase/functions/ai-faction-turn/briefing.ts` (new, ~200 lines)
- `supabase/functions/ai-faction-turn/actions.ts` (new, ~250 lines)
- `supabase/functions/ai-faction-turn/index.ts` (one shadow block inserted after `invokeAI`, ~30 lines)

## Hard constraints (NO-GO until data collected)

- Do **not** replace `systemPrompt` or `userPrompt`.
- Do **not** change AI tool schema.
- Do **not** change executor branches.
- Do **not** add Mode A/B/C switching.
- Do **not** change DB schema.
- Do **not** change model selection (Wave 1 logic stays).
- Briefing/valid_actions are **read-only outputs** logged to console.

## Acceptance metrics (after deploy)

After 5 peace turns + 5 tension/war turns, grep edge function logs for `[ai-shadow]` and report:

- average `current_chars` (peace vs war)
- average `briefing_chars` (peace vs war)
- reduction ratio
- average `valid_actions` count
- recurring top action types by frequency
- any turn with `valid_actions_count=0` (must be zero occurrences)
- coverage flags: `has_hold=true` always; `has_eco_def=true` in peace; `has_mil_dip=true` in tension/war

If all green → propose Increment 3 (Mode B switch) as a separate plan.

## Risks

- **Extra CPU per faction turn**: ~5 ms (pure JS over already-loaded arrays). Negligible.
- **Shadow throw**: wrapped in `try/catch`; cannot affect AI turn outcome.
- **No DB writes**: nothing to roll back.

## What to do after approval

Deploy `ai-faction-turn` only. Wait for the user to play 10 turns. Read logs via `supabase--edge_function_logs function_name=ai-faction-turn search="[ai-shadow]"` and produce the coverage/size report.
