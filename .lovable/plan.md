# Iterace 1: Premise Pipeline Consolidation (revize 2)

Cíl: jeden čistý source of truth pro AI kontext + důvěryhodná telemetrie. Žádný gameplay, žádná mapa, žádný wizard refactor.

## Klíčová architektonická oprava (oproti revizi 1)

**Problém v revizi 1:** P0b se mělo lepit do existujícího `premisePrompt` jako druhý průchod. To by zachovávalo původní bolest — premise stack by zase nebyl postaven jednou.

**Oprava:** `loadCivContext()` jako samostatný helper, `createAIContext` skládá P0+P0b v jednom průchodu, `invokeAI` přijímá `ctx` + metadata, log dostane konzistentní `request_id` / `session_id` / `premise_version` / `lineage_names_available`.

## Krok 1: Refaktor `_shared/ai-context.ts`

### 1.1 Nový helper `loadCivContext()`

```ts
export interface CivContext {
  civName?: string;
  civDescription?: string;        // dnes z civilizations.core_myth (viz POZN.)
  culturalQuirk?: string;
  architecturalStyle?: string;
  claimedLineages: Array<{
    name: string;
    description: string;
    culturalAnchor?: string;
  }>;
  // identity bonusy (pokud jsou v civ_identity)
  cultureTags?: string[];
  urbanStyle?: string;
  societyStructure?: string;
  militaryDoctrine?: string;
  economicFocus?: string;
}

export async function loadCivContext(
  sessionId: string,
  playerName: string,
  premise: WorldPremise,
  sb?: SupabaseClient,
): Promise<CivContext> { ... }
```

**POZN. ke `civDescription`:**
- Pro tuto iteraci: `civDescription: civ.core_myth ?? undefined`
- Pojmenováno v kódu jako `civDescription`, ne `coreMyth`, aby budoucí čistý sloupec `civilizations.civ_premise` byl drop-in nahrazení.
- Komentář v kódu: `// TODO: až přibude civilizations.civ_premise, prefer ten`.

**Filtrování `claimedLineages`:**
- Primárně `realm_heritage` se `eq("session_id").eq("player_name", playerName)`.
- Pokud tabulka vrátí 0 řádků (sloupec player_name prázdný / per-player adoption ještě neimplementovaný), fallback na první 2 rody z `premise.ancientLineages` jako "společné dědictví světa".
- Logovat varování `console.warn("loadCivContext: per-player heritage empty, using world fallback")` aby bylo vidět, kdy se dlouhodobě řeší datová slepota.

### 1.2 Změna signatury `buildPremisePrompt`

```ts
export function buildPremisePrompt(
  premise: WorldPremise,
  civContext?: CivContext,
): string
```

P0b sekce se vloží **uvnitř** funkce mezi P0 a P1, jen pokud je `civContext` předán. Žádné druhé skládání po faktu.

### 1.3 Refaktor `createAIContext`

```ts
export async function createAIContext(
  sessionId: string,
  turnNumber?: number,
  sb?: SupabaseClient,
  playerName?: string,
): Promise<AIRequestContext> {
  const requestId = crypto.randomUUID();
  const client = sb || getServiceClient();
  const premise = await loadWorldPremise(sessionId, client);
  const civContext = playerName
    ? await loadCivContext(sessionId, playerName, premise, client)
    : undefined;
  const premisePrompt = buildPremisePrompt(premise, civContext);
  return { sessionId, requestId, turnNumber, premise, premisePrompt, civContext };
}
```

Žádné dvoufázové skládání. Žádné string concat po faktu.

### 1.4 Refaktor `invokeAI` — přijímá `ctx` + metadata

**Nová signatura:**
```ts
export interface InvokeAIArgs {
  ctx: AIRequestContext;
  functionName: string;        // kdo volá (pro telemetrii)
  systemPrompt: string;        // funkce-specifická část (premisePrompt se prependuje uvnitř)
  userPrompt: string;
  model?: string;
  tools?: any[];
  toolChoice?: any;
  maxTokens?: number;
}

export async function invokeAI(args: InvokeAIArgs): Promise<AIInvokeResult>
```

Vnitřně:
- System prompt = `args.ctx.premisePrompt + "\n\n---\n\n" + args.systemPrompt`.
- Po response (úspěch i selhání) volat best-effort `logAIInvocation(args.ctx, args.functionName, model, success)`.
- `debug` v `AIInvokeResult` rozšířit o `playerContextUsed`, `lineageNamesAvailable`, `functionName`.

**Migrace existujících call-sites:** všechny `invokeAI(...)` v repu (saga-generate, chronicle, faction-turn, atd.) musí dostat `functionName`. Většinou stačí přidat 1 řádek — payload je z `ctx`.

### 1.5 Smoke testy `_shared/ai-context_test.ts`

- `buildPremisePrompt(premise)` neobsahuje "P0b".
- `buildPremisePrompt(premise, civContext)` obsahuje "P0b" + doslovně `civDescription`.
- `loadCivContext` s prázdným `realm_heritage` per-player vrátí fallback na world lineages.
- `loadCivContext` s naplněným per-player heritage vrátí jen ty.

## Krok 2: DB migrace `ai_invocation_log`

```sql
CREATE TABLE public.ai_invocation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  function_name text NOT NULL,
  player_name text,
  premise_version int,
  player_context_used boolean NOT NULL DEFAULT false,
  lineage_names_available text[] NOT NULL DEFAULT '{}',
  model text,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_invocation_log_session_idx
  ON public.ai_invocation_log (session_id, created_at DESC);
CREATE INDEX ai_invocation_log_function_idx
  ON public.ai_invocation_log (function_name, created_at DESC);

ALTER TABLE public.ai_invocation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/mods read ai_invocation_log"
  ON public.ai_invocation_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- INSERT: jen service role (edge functions); žádná policy pro authenticated → není potřeba.
```

`logAIInvocation` v `_shared/ai-context.ts` použije service client. Try/catch obalený, nikdy neshazuje AI volání.

## Krok 3: Migrace bypass generátorů

### 3.1 `generate-civ-start` (NEJVYŠŠÍ PRIORITA)

```ts
const ctx = await createAIContext(sessionId, undefined, sb, playerName);

// Request civDescription PŘEPISUJE DB hodnotu (wizard posílá ještě před uložením)
const effectiveCivContext: CivContext = {
  ...(ctx.civContext ?? { claimedLineages: [] }),
  civDescription, // z requestu
};
const premisePrompt = buildPremisePrompt(ctx.premise, effectiveCivContext);
const ctxOverridden: AIRequestContext = { ...ctx, civContext: effectiveCivContext, premisePrompt };

const result = await invokeAI({
  ctx: ctxOverridden,
  functionName: "generate-civ-start",
  systemPrompt: GENERATE_CIV_START_RULES, // jen RULES, žádný World premise
  userPrompt: `Tone: ${tone}\nBiome: ${biomeName}\nSettlement: ${settlementName}\nPlayer: ${playerName}\n\n${OUTPUT_JSON_SCHEMA}`,
  model: "google/gemini-2.5-flash",
  maxTokens: 1500,
});
```

User prompt už **nikdy** neopakuje `World premise: "..."` — je v `premisePrompt`.

### 3.2 `army-visualize`
- `createAIContext(sessionId, undefined, sb, ownerPlayerName)`.
- `invokeAI({ ctx, functionName: "army-visualize", systemPrompt, userPrompt })`.

### 3.3 `generate-building`
- `createAIContext(sessionId, undefined, sb, cityOwnerPlayerName)`.
- Smazat lokální načítání `architectural_style/cultural_quirk` — je v `ctx.civContext`.
- `invokeAI({ ctx, functionName: "generate-building", ... })`.

### 3.4 `person-portrait`
- Smazat lokální `fullContext` (game_style_settings + civilizations).
- `createAIContext(sessionId, undefined, sb, personOwnerPlayerName)`.
- `invokeAI({ ctx, functionName: "person-portrait", ... })`.

**Mimo scope iterace 1:** `wonder`, `encyclopedia-generate`, `explore-hex`, `explore-region`. Migrují se s iterací 2 (Ancient Remnants).

## Krok 4: Admin audit panel

Sekce v `AIDiagnosticsPanel.tsx` (admin/moderator only):
- Tabulka 100 nejnovějších záznamů z `ai_invocation_log` filtrovaná na current session.
- Sloupce: čas, funkce, hráč, P0 verze, P0b ✓/✗, # rodů (count + tooltip s jmény), model, ✓/✗ úspěch.
- Toggle "Skrýt funkce bez playerName" (chronicle, world-history…).
- Žádné AI scoring, žádné keyword matching.

## Atomické tasky (revidované pořadí)

1. `loadCivContext()` helper v `_shared/ai-context.ts` (čistá funkce, žádné jiné změny).
2. Změna signatury `buildPremisePrompt(premise, civContext?)` + P0b sekce uvnitř.
3. Refaktor `createAIContext` → P0b se skládá v jednom průchodu.
4. Refaktor `invokeAI({ ctx, functionName, ... })` + migrace všech existujících call-sites na nový signature.
5. DB migrace `ai_invocation_log` + RLS.
6. `logAIInvocation` v `invokeAI` (best-effort, service client).
7. Migrace `generate-civ-start` na unified pipeline (s `civDescription` override).
8. Migrace `army-visualize`, `generate-building`, `person-portrait`.
9. Smoke testy `_shared/ai-context_test.ts`.
10. Admin audit sekce v `AIDiagnosticsPanel.tsx`.

## Mimo scope iterace 1 (vědomě)

- Ancient Remnants jako nodes (iterace 2).
- Wizard UI per-player Civ Premise krok (iterace 3).
- Migrace `wonder`, `encyclopedia-generate`, `explore-*`.
- Sloupec `civilizations.civ_premise` — pro teď používáme `core_myth` s opatrným pojmenováním v kódu.
- AI-driven coherence scoring — nejdřív nech telemetrii promluvit.

## Co je potřeba znovu ověřit po implementaci

1. Skutečný stav sloupce `realm_heritage.player_name` — pokud chybí / je prázdný, fallback bude trvale aktivní (data slepota, ne bug pipeline). Vyřešit oddělenou data taskem.
2. Měřit přes `ai_invocation_log` poměr `player_context_used = true` u hráčských funkcí. Pokud < 100%, pipeline má díru.
