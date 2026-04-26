/**
 * generate-civ-start — Generates starting civilization conditions for a new player.
 *
 * Migrated to unified AI pipeline (createAIContext + invokeAI) so that the
 * generated nation, settlement and core_myth always cite both:
 *  - P0  (World Premise: Pradávno + Současnost + Zlom + Pradávné rody)
 *  - P0b (Player Premise: civDescription override + claimed lineages)
 *
 * The wizard passes `civDescription` (the player's own raw text). We feed it
 * into createAIContext as a civContextOverride so the AI sees P0b even before
 * civilizations.core_myth exists in DB.
 */

import {
  corsHeaders,
  createAIContext,
  invokeAI,
  jsonResponse,
  errorResponse,
} from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      sessionId,
      playerName,
      civDescription,
      tone,
      biomeName,
      settlementName,
    } = await req.json();

    if (!sessionId || !playerName || !civDescription) {
      return errorResponse("Missing required fields (sessionId, playerName, civDescription)", 400);
    }

    // Build context with player premise (civDescription override) so P0b is populated.
    const ctx = await createAIContext(
      sessionId,
      undefined,
      undefined,
      playerName,
      { civDescription, playerName },
    );

    const systemPrompt = `Jsi generátor počátečních podmínek civilizace pro středověkou/antickou strategickou hru.
Na základě hráčovy premisy národa (viz P0b výše) vytvoř vyvážené a vlajkově unikátní startovní podmínky.

PRAVIDLA:
- Zdroje musí být vyvážené. Součet (grain + wood + stone + iron + horses + gold) v rozmezí 60-120.
- Militaristický národ: více iron/horses, méně food. Obchodní národ: více gold, méně armády.
- KRITICKÉ: Hráč VŽDY začíná s nejmenší možnou osadou (HAMLET) o přesně 100 obyvatelích — všichni jsou rolníci (peasants). Žádní burghers ani clerics na startu. Tato čísla jsou PEVNÁ a engine je stejně přepíše — neuváděj jiná.
- Stabilita 55-80.
- Special resource: jeden z "IRON", "STONE", "HORSES", "NONE" — odvoď z popisu národa.
- core_myth (1-2 věty, ČESKY) MUSÍ navazovat na hráčovu premisu národa (P0b) i na premisu světa (P0 — Pradávno, Současnost, Zlom, Pradávné rody).
- cultural_quirk (1 věta, ČESKY) musí být specifická pro tento konkrétní národ.
- architectural_style (1-2 slova, ČESKY) musí korespondovat s identitou národa.
- settlement_flavor (krátký česky popis) musí odkazovat na biom A pradávné dědictví světa.

Odpověz POUZE validním JSON, žádný markdown.`;

    const userPrompt = `Hráč: "${playerName}"
Biom: "${biomeName || "pláně"}"
Název osady: "${settlementName || "Startovní osada"}"
Tón: "${tone || "mythic"}"

Vygeneruj startovní podmínky jako JSON:
{
  "realm_resources": {
    "grain_reserve": <int 10-40>,
    "production_reserve": <int 20-80>,
    "horses_reserve": <int 0-15>,
    "gold_reserve": <int 50-200>,
    "faith_reserve": <int 0-20>,
    "stability": <int 55-80>,
    "granary_capacity": <int 300-800>,
    "stables_capacity": <int 50-200>
  },
  "settlement": {
    "city_stability": <int 55-80>,
    "special_resource_type": "<IRON|STONE|HORSES|NONE>",
    "settlement_flavor": "<krátký český popis charakteru osady, MUSÍ odkazovat na pradávné dědictví světa nebo Zlom>"
  },
  "civilization": {
    "core_myth": "<1-2 věty česky, MUSÍ doslova navazovat na hráčovu premisu národa i na premisu světa>",
    "cultural_quirk": "<1 věta česky, specifická pro tento národ>",
    "architectural_style": "<1-2 slova česky>"
  }
}`;

    const result = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt,
      maxTokens: 1500,
      functionName: "generate-civ-start",
    });

    if (!result.ok || !result.data) {
      console.warn("[generate-civ-start] AI failed, returning defaults. err=", result.error);
      return jsonResponse({ ...getDefaults(), debug: result.debug });
    }

    const validated = validateAndClamp(result.data);
    return jsonResponse({ ...validated, debug: result.debug });
  } catch (e) {
    console.error("generate-civ-start error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});

// === ENGINE CONSTANTS — never overridable by AI ===
const STARTING_POPULATION_TOTAL = 100;
const STARTING_POPULATION_PEASANTS = 100;
const STARTING_POPULATION_BURGHERS = 0;
const STARTING_POPULATION_CLERICS = 0;
const STARTING_SETTLEMENT_LEVEL = "hamlet";

function getDefaults() {
  return {
    realm_resources: {
      grain_reserve: 20, production_reserve: 50,
      horses_reserve: 5, gold_reserve: 100, faith_reserve: 5,
      stability: 70, granary_capacity: 500, stables_capacity: 100,
    },
    settlement: {
      population_total: STARTING_POPULATION_TOTAL,
      population_peasants: STARTING_POPULATION_PEASANTS,
      population_burghers: STARTING_POPULATION_BURGHERS,
      population_clerics: STARTING_POPULATION_CLERICS,
      settlement_level: STARTING_SETTLEMENT_LEVEL,
      city_stability: 70, special_resource_type: "NONE", settlement_flavor: "",
    },
    civilization: {
      core_myth: "", cultural_quirk: "", architectural_style: "",
    },
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val || 0)));
}

function validateAndClamp(parsed: any) {
  const rr = parsed.realm_resources || {};
  const st = parsed.settlement || {};
  const cv = parsed.civilization || {};

  return {
    realm_resources: {
      grain_reserve: clamp(rr.grain_reserve, 10, 40),
      production_reserve: clamp(rr.production_reserve, 20, 80),
      horses_reserve: clamp(rr.horses_reserve, 0, 15),
      gold_reserve: clamp(rr.gold_reserve, 50, 200),
      faith_reserve: clamp(rr.faith_reserve, 0, 20),
      stability: clamp(rr.stability, 55, 80),
      granary_capacity: clamp(rr.granary_capacity, 300, 800),
      stables_capacity: clamp(rr.stables_capacity, 50, 200),
    },
    // ENGINE OVERRIDE — these values are ALWAYS forced regardless of AI output.
    // Hráč začíná vždy s 100 rolníky v hamletu. Žádný clamp, žádná tolerance.
    settlement: {
      population_total: STARTING_POPULATION_TOTAL,
      population_peasants: STARTING_POPULATION_PEASANTS,
      population_burghers: STARTING_POPULATION_BURGHERS,
      population_clerics: STARTING_POPULATION_CLERICS,
      settlement_level: STARTING_SETTLEMENT_LEVEL,
      city_stability: clamp(st.city_stability, 55, 80),
      special_resource_type: ["IRON", "STONE", "HORSES", "NONE"].includes(st.special_resource_type) ? st.special_resource_type : "NONE",
      settlement_flavor: (st.settlement_flavor || "").slice(0, 500),
    },
    civilization: {
      core_myth: (cv.core_myth || "").slice(0, 500),
      cultural_quirk: (cv.cultural_quirk || "").slice(0, 300),
      architectural_style: (cv.architectural_style || "").slice(0, 100),
    },
  };
}
