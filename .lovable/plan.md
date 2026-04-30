
## Plný audit a plán: AI Lab + Engine + MOVE_STACK + Liga

### Co dnes existuje a funguje
- **AI Lab** (`AILabTab`) má 3 vrstvy: `AIDiagnosticsPanel` (frakce/ekonomika/diplomacie/pipeline) ✅, `SmartAIGenerationPanel` (chybějící obsah) ✅, `DiplomacyDebugPanel` (8 záložek včetně **Trace** s `world_action_log`) ✅. Vše napojené na nový engine (`realm_resources`, `ai_factions`, `diplomatic_*`).
- AI loguje **každý tah** do `world_action_log` jako `action_type='ai_faction_turn'` s `description = "AI frakce X: N/M akcí [warState]. <internalThought>"` — to je přesně to, co je na screenshotu vidět.
- `world_action_log` má **nevyužitý `metadata jsonb` sloupec** — přesně sem patří rozšířený `diplomacy_trace` zmíněný v patičce panelu.

### Co je rozbité (DB-confirmed)
1. **AI nestaví armádu ani budovy** — `game_events` (kola 8–13) ukazuje od AI pouze `explore` + `treaty`. Žádný `military`/`recruit`/`build`. Code-path existuje (RECRUIT_STACK, BUILD_BUILDING), ale Gemini plánovač akce nevybírá. Promptu chybí "behavioral pressure" k vojenskému rozvoji.
2. **MOVE_STACK se nepřepne na další tah** — `executeMoveStack` v command-dispatch **nenastavuje** `moved_this_turn`, klient si ho zapisuje sám (porušení SSOT), a **nikde v `commit-turn`/`process-turn` se flag NEresetuje** → po prvním přesunu nejde nikdy znovu pohnout.
3. **Liga — nerovnost rosterů**: Lachim 22 hráčů/tým, AI frakce 7 hráčů/tým. Příčina: `world-generate-init:1010` používá legacy roster (goalkeeper/defender/midfielder/attacker = 11), `bulk-generate-teams` topup pro AI nedoběhl. Navíc duplikát "Panter Republika …" — chybí UNIQUE constraint na `(session_id, team_name)`.
4. **`DiplomacyDebugPanel` Trace tab** ukazuje jen text z `description`. Připravený rozšířený `diplomacy_trace` (input signals, weighted memories, candidate actions) **nikdy nebyl naplněn** — `metadata` sloupec zůstává prázdný.

---

## Plán implementace (1 milestone, 5 vrstev)

### Vrstva 1: Migrace
1. **Nový sloupec `world_action_log.metadata`** — už existuje, jen ho budeme plnit (žádná migrace). Indexy nepotřeba.
2. `ALTER TABLE league_teams ADD CONSTRAINT league_teams_session_team_name_unique UNIQUE (session_id, team_name)` + `DELETE` duplikátu "Panter Republika Korálových břehů – Hlavní" (ponechat starší).
3. **Cleanup zaseknutého stavu pro session 0de6fab4**: `UPDATE military_stacks SET moved_this_turn=false WHERE session_id='0de6fab4-…'` aby se Lachim mohl pohybovat hned po deployi opravy.

### Vrstva 2: Backend — MOVE_STACK SSOT (ten "bug v moving stack")
1. `executeMoveStack` (command-dispatch:750–810) přidá `moved_this_turn: true` do update.
2. Odstranit klientský zápis ve `WorldHexMap.tsx:1027` (porušuje SSOT).
3. V `commit-turn` na začátku fáze 3 (před AI faction loop): `await supabase.from("military_stacks").update({moved_this_turn: false}).eq("session_id", sessionId)` — reset všem stackům, hráčským i AI.

### Vrstva 3: Backend — AI staví armádu + rozšířený trace logging

#### 3a. Behavioral pressure v `ai-faction-turn` system promptu
Přidat tvrdé pravidlo v prompt builderu:
- `garrison_ratio < 5% population` **NEBO** `at_war = true` → akce `recruit_army` má prioritu nad explore/diplomacy (musí být v top 3 navržených akcí).
- `wealth_reserve > 200` AND existují volné district sloty → minimálně 1× `build_building` per tah.
- `manpower < target_pool * 0.3` → zvýšit `mobilization_rate` (decree action).
- Personality multiplikátor: `aggressive → 12% army target`, `expansionist → 10%`, `defensive → 8%`, `mercantile/diplomatic → 5%`.

Konkrétní změna: rozšířit `behaviorRules` sekci v prompt builderu (~ řádek 350–500 v `ai-faction-turn`) o explicitní military doctrine klauzule.

#### 3b. Rozšířený `diplomacy_trace` do `metadata`
V `ai-faction-turn:865` rozšířit insert do `world_action_log`:
```ts
metadata: {
  // input signals (co AI viděla)
  inputs: {
    military: { manpower_pool, garrison_ratio, war_state, my_stacks_count, my_total_strength, enemy_stacks_count, enemy_total_strength },
    economic: { wealth, grain, production, capacity, mobilization_rate },
    spatial: { my_nodes, controlled_routes, blockades_against_me, supply_isolated_count },
    diplomatic: { active_pacts: pacts.length, hostile_relations, allied_relations, pending_ultimatums },
  },
  // weighted memories (co AI vážila)
  weighted_memories: diplomMemories.slice(0, 8).map(m => ({
    type: m.memory_type, target: other(m), weight: m.importance * (1 - m.decay_rate * (turn - m.turn_number)), detail: m.detail.slice(0, 120),
  })),
  // candidate actions (co Gemini navrhl, než exekuovala)
  candidate_actions: result.actions.map(a => ({ type: a.actionType, target: a.targetCity || a.targetFaction, priority: a.priority || null })),
  // executed
  executed_actions: executedActions.map(a => ({ type: a.actionType, ok: a.executed, error: a.error || null, result: a.result })),
  // doctrine + war state
  doctrine: derivedDoctrine, // 'military' | 'expansion' | 'economy' | 'diplomacy'
  war_state: milMetrics.warState,
  // model + timing
  model_used: result.modelUsed || "google/gemini-2.5-pro",
  ms_elapsed: Date.now() - startedAt,
}
```

#### 3c. Tabulka `ai_faction_turn_summary` (nová migrace)
Pro rychlé dotazy v dashboardu bez parsing JSONB:
```sql
CREATE TABLE ai_faction_turn_summary (
  id uuid PK,
  session_id uuid REF,
  faction_name text,
  turn_number int,
  doctrine text,            -- military|expansion|economy|diplomacy
  war_state text,           -- peace|tension|war
  actions_planned int,
  actions_executed int,
  actions_failed int,
  recruits_attempted int,   -- count of recruit_army actions
  builds_attempted int,     -- count of build_building
  attacks_attempted int,
  power_delta int,          -- vs minulé kolo
  wealth_delta int,
  internal_thought text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, faction_name, turn_number)
);
ALTER TABLE ai_faction_turn_summary ENABLE ROW LEVEL SECURITY;
-- RLS: members of session_id mohou číst (přes game_memberships)
```
Insert na konci `ai-faction-turn` (vedle `world_action_log`).

### Vrstva 4: Frontend — rozšíření AI Lab

#### 4a. Nový tab `Engine` v `AIDiagnosticsPanel`
Vedle existujících `Chování / Ekonomika / Diplomacie / Pipeline` přidat 5. tab `Engine`:
- **Tabulka per-faction × posledních 5 tahů** (z `ai_faction_turn_summary`): doctrine ikona, plánováno/provedeno/selhalo, ⚔ recruits, 🏗 builds, ⚡ attacks, +/- power, +/- wealth.
- **Stagnační detektor**: žluté varování "Frakce X bez recruitu/buildu 3+ tahy".
- **"Vynutit AI tah teď"** (admin-only) → invokuje `ai-faction-turn` pro vybranou frakci.
- **Last-error detail**: rozkliknutelný řádek ukáže `failure_reasons` z `metadata.executed_actions[].error`.

Komponent: `src/components/dev/AIFactionEnginePanel.tsx`. Napojit do `AIDiagnosticsPanel` jako 5. `TabsTrigger`.

#### 4b. Rozšířený Trace v `DiplomacyDebugPanel`
Upravit `DecisionTrace` komponentu (řádek 423–451):
- Načíst i `metadata` z `world_action_log` (rozšířit fetch query).
- Zobrazit pod `internalThought` rozbalitelnou sekci s tabulkami:
  - **Vstupní signály** (key/value mřížka: Military, Economic, Spatial, Diplomatic).
  - **Zvážené paměti** (top 8 dle weight: type, target, weight, detail).
  - **Kandidátní vs provedené akce** (vedle sebe se ✅/❌).
- Odstranit footnote "připraveno k rozšíření" — bude reálně rozšířeno.

### Vrstva 5: Liga — parita rosteru
1. **Migrace** (Vrstva 1) řeší duplikáty + UNIQUE.
2. **Fix `world-generate-init:1010`**: nahradit legacy POSITIONS (4 skupiny, 11 hráčů) za Sphaera POSITIONS (5 skupin, 22 hráčů: 2 praetor / 5 guardian / 7 striker / 4 carrier / 4 exactor) — zkopírovat z `bulk-generate-teams:34–40`. Tím nové světy už nikdy nebudou mít nerovnost.
3. **One-shot opravná akce pro session 0de6fab4**: po deployi spustit `bulk-generate-teams` s `players_per_team=22` přes `OnboardingChecklist` (nebo dev tlačítko). Topup logika v sekci "Fill existing teams to target player count" doplní AI týmy z 7 na 22.
4. **Onboarding hook**: přidat krok "Ensure team rosters" do `OnboardingChecklist` po vytvoření světa, který volá `bulk-generate-teams` s `players_per_team=22`.

---

## Pořadí implementace

1. **Migrace**: `ai_faction_turn_summary`, `league_teams` UNIQUE + dedupe, reset `moved_this_turn` pro 0de6fab4.
2. **MOVE_STACK SSOT** (command-dispatch + commit-turn + WorldHexMap cleanup).
3. **AI doctrine v promptu** + rozšířený metadata logging do `world_action_log` + insert do `ai_faction_turn_summary`.
4. **Frontend**: nový `AIFactionEnginePanel` + integrace do `AIDiagnosticsPanel` + rozšířený `DecisionTrace`.
5. **Liga**: oprava `world-generate-init` rosteru + onboarding hook + ruční topup pro 0de6fab4.
6. **Update Memory** (`mem://features/ai-factions/behavioral-logic-v2`): doctrine pressure rules + diplomacy_trace metadata schema.

---

## Otázky

Jen jedna kritická volba — zbytek je deterministický:

**Jak agresivně boostnout AI doctrine pressure?**
- **Konzervativně**: jen "při válce nebo nízké garnizoně vynutit recruit". Pacifistické AI dál mohou stagnovat.
- **Vyváženě (doporučeno)**: každá AI frakce má _minimum_ 1× build/recruit per turn dokud nemá ≥2 stacky a ≥3 buildings; pak se chová podle personality.
- **Agresivně**: každá AI frakce každý tah povinně 1× recruit + 1× build, jinak fail-flag v summary.

Bez odpovědi jdu cestou **Vyváženě**.
