# Military / AI audit and completion plan

## What the audit confirmed
- AI factions in session `IJ8BQ5` are still effectively disarmed: only Lachim currently has a `military_stacks` row.
- The main blocker is a hard mismatch in recruitment logic:
  - `ai-faction-turn` forced recruitment triggers at roughly `40–80 manpower`.
  - `command-dispatch` militia preset still resolves to a `400 manpower` stack.
  - Result: AI logs say `FORCED RECRUIT`, but the actual `RECRUIT_STACK` command fails every time.
- AI action reporting is misleading:
  - `ai-faction-turn` marks many actions as executed even when the returned result is not truly successful.
  - In `world_action_log`, AI turns therefore look active, but no stacks are created.
- A second backend contract mismatch exists for construction:
  - `ai-faction-turn` sends `build_building` with `buildingName/templateId`.
  - `command-dispatch` now expects `payload.building`.
  - This causes real 400 errors: `Missing cityId or building`.
- AI is generating plans, but most military follow-through is missing or weak:
  - recruit fails
  - deploy is not guaranteed after recruit
  - attack logic depends on existing deployed stacks
  - recovery after defeat is not deterministic enough
- There is also an observability gap:
  - `ai_faction_turn_summary` appears missing in the backend, so part of the AI Lab/debug surface is likely not persisting.

## Implementation plan

### 1) Fix recruitment so AI can actually create armies
- Align the AI fallback thresholds with the real recruitment backend.
- Choose one canonical approach and apply it consistently:
  1. either lower militia to a true emergency/light formation,
  2. or keep militia at 400 and raise AI fallback/emergency manpower to that real threshold.
- I recommend the first option: add a real emergency militia tier for AI/hard recovery states so destroyed factions can re-enter the game without waiting many turns.
- Ensure cost formulas, manpower checks, and preset sizes are derived from one shared source instead of duplicated constants.

### 2) Make AI success/failure accounting truthful
- Update `ai-faction-turn` so actions are only counted as successful when the backend command truly succeeded.
- Distinguish clearly between:
  - planned
  - attempted
  - succeeded
  - failed
  - skipped
- Log backend errors directly into AI trace metadata so the AI Lab reflects real blockers instead of false positives.

### 3) Repair the broken AI building command path
- Normalize `build_building` payloads so `ai-faction-turn` sends the structure expected by `command-dispatch`.
- Reuse the same resolution logic as player-side building flows where possible.
- Add defensive validation so future schema drift cannot silently break AI construction again.

### 4) Add a deterministic military recovery state machine for AI
- Introduce a simple fallback sequence when AI has no active army:
  1. raise mobilization
  2. recruit emergency stack
  3. deploy to capital / safest owned city
  4. defend city if enemy nearby
  5. move toward threatened border only after at least one garrison exists
- This logic should run even if the model output is bad or incomplete.
- Keep the model for flavor and prioritization, but force the minimum military loop server-side.

### 5) Improve AI war behavior after armies exist
- Add deterministic rules for:
  - defend threatened city first
  - counterattack adjacent occupier if favorable
  - garrison capital before expansion
  - avoid suicide attacks with low morale / no advantage
  - prioritize reclaiming occupied cities over random aggression
- Ensure AI can do all of: recruit, deploy, move, attack, and reconstitute after losses.
- Keep AI simplification acceptable: it does not need perfect tactics, but it must be functional and legible.

### 6) Strengthen turn-engine integration for AI military actions
- Verify that AI-created battle actions always enter the same resolution path used by players.
- Ensure post-recruit deployment and queued battle actions are processed in the same turn loop consistently.
- Add guardrails so stale or impossible actions are canceled cleanly instead of clogging the action flow.

### 7) Restore/debug observability for AI turns
- Repair or create the missing `ai_faction_turn_summary` storage so AI Lab can show real numbers.
- Expose per-turn military diagnostics such as:
  - active stacks
  - deployable stacks
  - manpower pool
  - recruit affordability
  - last failed command reason
  - nearby enemy pressure
- This will make future AI military regressions easy to detect.

### 8) Apply a live repair pass to the current lobby state
- After code fixes, run a targeted repair for `IJ8BQ5` so the lobby is not stuck in a pre-fix dead state.
- Validate current AI factions, clean any broken pending military actions if needed, and ensure next turn can produce actual armies.
- If necessary, normalize AI resource/mobilization state so the repaired logic takes effect immediately.

## Files likely involved
- `supabase/functions/ai-faction-turn/index.ts`
- `supabase/functions/command-dispatch/index.ts`
- `supabase/functions/commit-turn/index.ts`
- possibly `supabase/functions/resolve-battle/index.ts`
- a migration for AI summary/debug storage if the summary table is indeed absent
- optional AI Lab / military debug UI if existing panels need to show the corrected diagnostics

## Technical details
```text
Current broken path:
AI fallback says: recruit if manpower >= 40..80
        ↓
ai-faction-turn sends RECRUIT_STACK
        ↓
command-dispatch militia preset requires 400 manpower
        ↓
command fails
        ↓
AI log still appears mostly successful
        ↓
no stack exists, so no deploy / no attack / no real war behavior
```

```text
Target stable loop:
No stacks
  → emergency recruit succeeds
  → stack created
  → deploy to owned city
  → defend if enemy adjacent
  → move/attack only when viable
  → after losses, repeat recovery automatically
```

## Validation after implementation
- In `IJ8BQ5`, at least one AI faction should successfully create a new `military_stacks` row on the next processed turn.
- `world_action_log` should show real `RECRUIT_STACK` / `DEPLOY_STACK` events, not only AI narrative summaries.
- AI factions should no longer report successful recruitment when no stack was created.
- Building attempts from AI should no longer fail with `Missing cityId or building`.
- AI with zero armies should recover within a predictable number of turns instead of staying permanently inert.
- If an enemy is adjacent, AI should eventually defend or attack through the standard battle pipeline.

If you approve this plan, I’ll implement the fixes and then do a live verification pass against the current game state.