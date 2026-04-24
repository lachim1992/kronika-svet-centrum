// translate-premise-to-spec (Inkrement 3)
//
// Premise-first wizard endpoint. Takes a premise + optional userOverrides +
// lockedPaths and returns a fully validated WorldgenSpecV1.
//
// Flow:
//   1. Zod validate request
//   2. Normalize premise + derive deterministic seed (UUIDv5)
//   3. Call AI (Lovable AI Gateway, gemini-2.5-pro w/ tool calling)
//   4. Server-side normalize (clamp, fill, biome weights)
//   5. Hard-merge userOverrides on top (AI never gets to ignore locks)
//   6. Return { spec, normalizedPremise, warnings[] }
//
// Auth: verify_jwt = true (configured via supabase/config.toml).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import {
  applyHardOverrides,
  deriveSeed,
  normalizePremise,
  normalizeSpec,
  TranslateRequestSchema,
} from "../_shared/worldgen-spec-validation.ts";
import { BIOME_KEY_SET } from "../_shared/biome-keys.ts";
import type {
  TranslatePremiseResponse,
  TranslateWarning,
  WorldgenSpecV1,
} from "../_shared/world-bootstrap-types.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = "google/gemini-2.5-pro";

// ─── AI tool schema (structured output) ──────────────────────────────────────
const SPEC_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "emit_worldgen_spec",
    description: "Emit a complete WorldgenSpecV1 derived from the user's premise.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["userIntent", "factionCount", "terrain", "geographyBlueprint"],
      properties: {
        userIntent: {
          type: "object",
          additionalProperties: false,
          required: ["worldName", "tone", "victoryStyle", "style", "size"],
          properties: {
            worldName: { type: "string", description: "1–3 word evocative name." },
            tone: { type: "string", enum: ["realistic", "mythic", "dark_fantasy", "heroic", "grim"] },
            victoryStyle: { type: "string", enum: ["story", "domination", "survival", "sandbox"] },
            style: { type: "string", description: "Short label: e.g. nautical, frontier, imperial." },
            size: { type: "string", enum: ["small", "medium", "large"] },
          },
        },
        factionCount: { type: "integer", minimum: 0, maximum: 6 },
        terrain: {
          type: "object",
          additionalProperties: false,
          required: ["targetLandRatio", "continentShape", "continentCount", "mountainDensity", "biomeWeights"],
          properties: {
            targetLandRatio: { type: "number", minimum: 0.1, maximum: 0.9 },
            continentShape: { type: "string", enum: ["pangaea", "two_continents", "archipelago", "crescent", "mixed"] },
            continentCount: { type: "integer", minimum: 1, maximum: 6 },
            mountainDensity: { type: "number", minimum: 0, maximum: 0.8 },
            biomeWeights: {
              type: "object",
              description: "Biome name → weight (will be normalized to sum=1).",
              additionalProperties: { type: "number", minimum: 0 },
            },
          },
        },
        geographyBlueprint: {
          type: "object",
          additionalProperties: false,
          required: ["ridges", "biomeZones", "climateGradient", "oceanPattern"],
          properties: {
            ridges: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "startQ", "startR", "endQ", "endR", "strength"],
                properties: {
                  id: { type: "string" },
                  startQ: { type: "integer" },
                  startR: { type: "integer" },
                  endQ: { type: "integer" },
                  endR: { type: "integer" },
                  strength: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
            biomeZones: {
              type: "array",
              maxItems: 24,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "biome", "centerQ", "centerR", "radius", "intensity"],
                properties: {
                  id: { type: "string" },
                  biome: { type: "string" },
                  centerQ: { type: "integer" },
                  centerR: { type: "integer" },
                  radius: { type: "number", minimum: 1, maximum: 12 },
                  intensity: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
            climateGradient: { type: "string", enum: ["north_warm", "south_warm", "equator", "uniform"] },
            oceanPattern: { type: "string", enum: ["surrounding", "inland_sea", "channels", "minimal"] },
          },
        },
      },
    },
  },
};

function buildSystemPrompt(lockedPaths: string[], hasOverrides: boolean): string {
  let prompt = `Jsi worldgen architekt pro tahovou strategii. Z premise hráče vytvoříš kompletní WorldgenSpec.

Pravidla:
- Vrátíš PRÁVĚ JEDNO volání tool 'emit_worldgen_spec' s kompletním specem.
- Pole biomeWeights používej běžné biomy: plains, forest, hills, mountain, desert, tundra, coast, swamp.
- ridges & biomeZones jsou krátké (max ~6 ridges, ~10 zones) a vystihují charakter světa.
- worldName: 1–3 slova v češtině nebo univerzální fantasy jméno.
- factionCount odhadni z premise (sólová říše = 0–1, plno říší = 4–6).`;

  if (lockedPaths.length > 0) {
    prompt += `\n\nLOCKED PATHS (NEPŘEPISUJ tyto hodnoty — server je stejně vynutí):\n${lockedPaths.map((p) => `  - ${p}`).join("\n")}`;
  }
  if (hasOverrides) {
    prompt += `\n\nHráč už některá pole nastavil ručně (viz userOverrides v contextu). Respektuj je v narativu.`;
  }
  return prompt;
}

async function callAI(premise: string, lockedPaths: string[], userOverrides: any): Promise<{ raw: any; warnings: TranslateWarning[] }> {
  const warnings: TranslateWarning[] = [];

  const userMessage = userOverrides && Object.keys(userOverrides).length > 0
    ? `Premise: """${premise}"""\n\nUser overrides (respect these):\n\`\`\`json\n${JSON.stringify(userOverrides, null, 2)}\n\`\`\``
    : `Premise: """${premise}"""`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(lockedPaths, !!userOverrides && Object.keys(userOverrides).length > 0) },
        { role: "user", content: userMessage },
      ],
      tools: [SPEC_TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "emit_worldgen_spec" } },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 429) {
    throw new Response(JSON.stringify({ ok: false, error: "Příliš mnoho požadavků. Zkuste znovu za chvíli." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (response.status === 402) {
    throw new Response(JSON.stringify({ ok: false, error: "AI kredit vyčerpán. Doplňte v Lovable Cloud." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI gateway: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function?.name !== "emit_worldgen_spec") {
    warnings.push({ code: "GENERIC_PREMISE", message: "AI nevrátila strukturovaný výstup, použity defaulty." });
    return { raw: {}, warnings };
  }

  let parsed: any;
  try {
    parsed = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  } catch {
    warnings.push({ code: "GENERIC_PREMISE", message: "AI vrátila neparsovatelný JSON, použity defaulty." });
    return { raw: {}, warnings };
  }
  return { raw: parsed, warnings };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Payload size cap (10 KB)
    const text = await req.text();
    if (text.length > 10_240) {
      return new Response(JSON.stringify({ ok: false, error: "Payload příliš velký (max 10 KB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Neplatný JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = TranslateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ ok: false, error: parsed.error.errors[0]?.message || "Neplatný požadavek" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { premise, userOverrides, lockedPaths, regenerationNonce } = parsed.data;
    const normalizedPremise = normalizePremise(premise);
    const seed = await deriveSeed(premise, regenerationNonce ?? 0);

    // ── AI call ──
    const { raw: aiRaw, warnings: aiWarnings } = await callAI(
      premise,
      lockedPaths ?? [],
      userOverrides,
    );

    // ── Server-side normalize ──
    const warnings: TranslateWarning[] = [...aiWarnings];
    let spec: WorldgenSpecV1 = normalizeSpec(aiRaw, { premise, seed, warnings });

    // ── Hard merge overrides (AI cannot escape locks) ──
    spec = applyHardOverrides(spec, userOverrides, warnings);

    // Heuristic warning for very short premise
    if (premise.trim().length < 80) {
      warnings.push({ code: "GENERIC_PREMISE", message: "Premisa je krátká — AI návrh je obecnější." });
    }

    // Biome drift audit (mirror list — see _shared/biome-keys.ts).
    // We log instead of failing — the spec is still useful even with extra biome keys.
    const driftedBiomes: string[] = [];
    for (const b of Object.keys(spec.terrain.biomeWeights ?? {})) {
      if (!BIOME_KEY_SET.has(b)) driftedBiomes.push(b);
    }
    if (driftedBiomes.length > 0) {
      console.warn(
        "[translate-premise-to-spec] BIOME_DRIFT — spec contains biomes outside canonical mirror list:",
        driftedBiomes,
      );
    }

    const resp: TranslatePremiseResponse = {
      ok: true,
      spec,
      normalizedPremise,
      warnings,
    };
    return new Response(JSON.stringify(resp), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[translate-premise-to-spec] error:", err);
    const msg = err instanceof Error ? err.message : "Neznámá chyba";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
