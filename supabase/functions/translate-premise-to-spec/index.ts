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
import { AncientLayerSchema } from "../_shared/ancient-layer-schema.ts";
import {
  ANCIENT_PROMPT_VERSION,
  computeSeedHash,
  generateFallbackAncientLayer,
} from "../_shared/ancient-layer-generator.ts";
import type { AncientLayerSpec } from "../_shared/ancient-layer-types.ts";

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

// ─── Ancient Layer AI tool schema (Track 1, T1-PR2) ──────────────────────────
//
// This emits ONLY the AI-derivable fields. version, generated_with_prompt_version,
// seed_hash, and selected_lineages are filled server-side (K3 determinism).

const ANCIENT_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "emit_ancient_layer",
    description:
      "Emit the mythic prequel layer for the world: the great rupture event, " +
      "5–8 founding lineages players can claim, and 4–6 mythic seed locations.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["reset_event", "lineage_candidates", "mythic_seeds"],
      properties: {
        reset_event: {
          type: "object",
          additionalProperties: false,
          required: ["type", "description", "turn_offset"],
          properties: {
            type: {
              type: "string",
              description: "Short slug, e.g. great_silence, skyfall, drowning, ash_winter, godwound.",
            },
            description: {
              type: "string",
              description: "1–3 sentences describing the rupture event in tone-appropriate language.",
            },
            turn_offset: {
              type: "integer",
              description: "Negative offset in turns from the rupture to turn 1 (e.g. -500).",
            },
          },
        },
        lineage_candidates: {
          type: "array",
          minItems: 5,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name", "description"],
            properties: {
              id: { type: "string", description: "Stable id like l1, l2, l3..." },
              name: { type: "string" },
              description: { type: "string" },
              cultural_anchor: { type: "string", description: "Optional short slug." },
            },
          },
        },
        mythic_seeds: {
          type: "array",
          minItems: 4,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "hex_q", "hex_r", "tag"],
            properties: {
              id: { type: "string" },
              hex_q: { type: "integer" },
              hex_r: { type: "integer" },
              tag: {
                type: "string",
                description: "Lowercase slug, e.g. ruin, altar, leyline_node, drowned_gate.",
              },
            },
          },
        },
      },
    },
  },
};

function buildAncientSystemPrompt(): string {
  return `Jsi mytický architekt světa. Z premise hráče vytvoříš PRADÁVNOU VRSTVU světa:
1) reset_event — velký zlom, který oddělil starý svět od věku hráčů.
2) lineage_candidates — 5–8 zakládajících linií (rodů, kultů, řemeslnických cechů), ze kterých si hráč později vybere.
3) mythic_seeds — 4–6 hexových souřadnic (q, r) v rozsahu zhruba -30..30 / -20..20, kde leží relikty starého řádu.

Pravidla:
- Vrátíš PRÁVĚ JEDNO volání tool 'emit_ancient_layer'.
- ID: l1..l8 pro linie, m1..m6 pro mythic seeds.
- Tag mythic_seed je vždy lowercase slug (např. ruin, altar, leyline_node).
- Linie musí být tematicky kompatibilní s tonalitou premise.
- Reset event musí být vážný geopolitický/mytický zlom, ne kosmetický.`;
}

async function callAncientAI(
  premise: string,
): Promise<{ raw: unknown | null; warning?: TranslateWarning }> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: buildAncientSystemPrompt() },
          { role: "user", content: `Premise: """${premise}"""` },
        ],
        tools: [ANCIENT_TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "emit_ancient_layer" } },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      // Soft-fail: bootstrap continues with deterministic fallback (K4).
      return {
        raw: null,
        warning: {
          code: "ANCIENT_LAYER_FALLBACK",
          message: `AI ancient_layer call returned ${response.status}; using deterministic fallback.`,
        },
      };
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "emit_ancient_layer") {
      return {
        raw: null,
        warning: {
          code: "ANCIENT_LAYER_FALLBACK",
          message: "AI did not return ancient_layer tool call; using deterministic fallback.",
        },
      };
    }

    const parsed = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    return { raw: parsed };
  } catch (err) {
    return {
      raw: null,
      warning: {
        code: "ANCIENT_LAYER_FALLBACK",
        message: `AI ancient_layer call threw: ${err instanceof Error ? err.message : "unknown"}; using deterministic fallback.`,
      },
    };
  }
}

/**
 * Builds an AncientLayerSpec by combining server-side deterministic fields
 * with optional AI-supplied creative fields. Always validated by Zod.
 *
 * If AI output is missing or invalid, falls back to a fully deterministic
 * generator (K3: same seed_hash → same fallback).
 */
async function buildAncientLayer(
  normalizedPremise: string,
  nonce: number,
  aiRaw: unknown | null,
  warnings: TranslateWarning[],
): Promise<AncientLayerSpec> {
  const seedHash = await computeSeedHash(normalizedPremise, nonce);

  if (aiRaw && typeof aiRaw === "object") {
    // Try to combine AI creative fields with server-controlled deterministic fields.
    const candidate = {
      ...(aiRaw as Record<string, unknown>),
      version: 1 as const,
      generated_with_prompt_version: ANCIENT_PROMPT_VERSION,
      seed_hash: seedHash,
      selected_lineages: [] as string[],
    };
    const parseResult = AncientLayerSchema.safeParse(candidate);
    if (parseResult.success) {
      return parseResult.data;
    }
    warnings.push({
      code: "ANCIENT_LAYER_INVALID_AI",
      message: `AI ancient_layer failed schema validation: ${parseResult.error.errors[0]?.message ?? "unknown"}; using fallback.`,
    });
  }

  return generateFallbackAncientLayer(seedHash);
}

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
