/**
 * Seedmap Patch — AI-driven hex map refinement.
 * 
 * Accepts current map summary + user request, returns a JSON patch
 * (max 80 tile edits) that improves the map toward the request.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

const SYSTEM_PROMPT = `You are Seedmap Patch AI for a hex-grid world generator.

Hard rules:
- Output ONLY valid JSON matching the Patch schema via the tool call.
- Never rewrite the whole map. Max 80 tile edits per patch.
- Preserve global connectivity unless explicitly asked to create isolated regions.
- Respect constraints: min/max province size, blocked ratio limits, chokepoint rules.
- Passability changes must be consistent: blocked tiles should form coherent barriers (mountain ridge, swamp, cliff), not random noise.
- Province borders must remain contiguous: each province must be a connected component.

What to optimize:
1) Visual coherence (biome clustering, natural borders)
2) Gameplay readability (clear provinces, chokepoints)
3) Navigation (reasonable routes between hubs)
4) Constraint compliance (connectivity, province size)

Valid biome_family values: sea, plains, forest, hills, mountains, desert, tundra, swamp

Valid tile fields you can set: biome_family, mean_height (0-100), moisture_band (0-4), temp_band (0-4), coastal (bool)

Return your patch via the seedmap_patch tool.`;

const PATCH_TOOL = {
  type: "function",
  function: {
    name: "seedmap_patch",
    description: "Return a map patch with tile edits",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "One sentence describing what this patch does",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["set"] },
              q: { type: "number" },
              r: { type: "number" },
              fields: {
                type: "object",
                properties: {
                  biome_family: { type: "string" },
                  mean_height: { type: "number" },
                  moisture_band: { type: "number" },
                  temp_band: { type: "number" },
                  coastal: { type: "boolean" },
                },
              },
            },
            required: ["op", "q", "r", "fields"],
          },
          description: "List of tile edits, max 80",
        },
        notes: {
          type: "string",
          description: "Brief rationale for the changes",
        },
        validation_expectations: {
          type: "string",
          description: "What should improve after applying this patch",
        },
      },
      required: ["intent", "changes", "notes", "validation_expectations"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, user_request, sample_tiles, validation_report } = await req.json();

    if (!session_id || !user_request) {
      return errorResponse("session_id and user_request required", 400);
    }

    const sb = getServiceClient();

    // Build map summary from DB
    const { data: hexes } = await sb
      .from("province_hexes")
      .select("q, r, biome_family, mean_height, moisture_band, temp_band, coastal")
      .eq("session_id", session_id)
      .limit(5000);

    if (!hexes || hexes.length === 0) {
      return errorResponse("No hexes found for this session", 404);
    }

    // Compute summary stats
    const biomeCounts: Record<string, number> = {};
    let blockedCount = 0;
    let coastalCount = 0;
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;

    for (const h of hexes) {
      biomeCounts[h.biome_family] = (biomeCounts[h.biome_family] || 0) + 1;
      if (h.biome_family === "sea" || h.biome_family === "mountains") blockedCount++;
      if (h.coastal) coastalCount++;
      if (h.q < minQ) minQ = h.q;
      if (h.q > maxQ) maxQ = h.q;
      if (h.r < minR) minR = h.r;
      if (h.r > maxR) maxR = h.r;
    }

    const mapSummary = {
      total_hexes: hexes.length,
      grid_bounds: { minQ, maxQ, minR, maxR },
      biome_counts: biomeCounts,
      blocked_ratio: blockedCount / hexes.length,
      coastal_count: coastalCount,
    };

    // Build user prompt
    const userPromptParts = [
      `MAP SUMMARY:\n${JSON.stringify(mapSummary, null, 2)}`,
    ];

    if (sample_tiles?.length) {
      userPromptParts.push(`SAMPLE TILES (subset):\n${JSON.stringify(sample_tiles.slice(0, 50))}`);
    }

    if (validation_report) {
      userPromptParts.push(`VALIDATION REPORT:\n${JSON.stringify(validation_report)}`);
    }

    userPromptParts.push(`USER REQUEST: ${user_request}`);

    const ctx = await createAIContext(session_id, undefined, sb);

    const result = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPromptParts.join("\n\n"),
      tools: [PATCH_TOOL],
      toolChoice: { type: "function", function: { name: "seedmap_patch" } },
      maxTokens: 4000,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error, debug: result.debug }, result.status || 500);
    }

    const patch = result.data;

    // Validate & clamp changes
    if (patch.changes?.length > 80) {
      patch.changes = patch.changes.slice(0, 80);
      patch.notes += " [CLAMPED to 80 edits]";
    }

    // Optionally apply patch to DB
    const applyErrors: string[] = [];
    if (patch.changes?.length) {
      for (const change of patch.changes) {
        const { q, r, fields } = change;
        // Sanitize fields
        const update: Record<string, any> = {};
        if (fields.biome_family) update.biome_family = fields.biome_family;
        if (fields.mean_height != null) update.mean_height = Math.max(0, Math.min(100, Math.round(fields.mean_height)));
        if (fields.moisture_band != null) update.moisture_band = Math.max(0, Math.min(4, Math.round(fields.moisture_band)));
        if (fields.temp_band != null) update.temp_band = Math.max(0, Math.min(4, Math.round(fields.temp_band)));
        if (fields.coastal != null) update.coastal = !!fields.coastal;

        if (Object.keys(update).length > 0) {
          const { error } = await sb
            .from("province_hexes")
            .update(update)
            .eq("session_id", session_id)
            .eq("q", q)
            .eq("r", r);
          if (error) applyErrors.push(`(${q},${r}): ${error.message}`);
        }
      }
    }

    return jsonResponse({
      patch,
      applied: true,
      applied_count: (patch.changes?.length || 0) - applyErrors.length,
      errors: applyErrors.length > 0 ? applyErrors : undefined,
      debug: result.debug,
    });
  } catch (e) {
    console.error("seedmap-patch error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
