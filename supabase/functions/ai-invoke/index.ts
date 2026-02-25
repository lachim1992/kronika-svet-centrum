/**
 * AI Invoke Proxy — Central gateway for client-side AI requests.
 * 
 * Automatically injects world premise, session context, and requestId.
 * Used by frontend when calling AI directly (not via specialized functions).
 * 
 * Most generators import _shared/ai-context.ts directly for efficiency.
 * This proxy is for ad-hoc / generic AI calls from the client.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, turnNumber, systemPrompt, userPrompt, model, tools, toolChoice, maxTokens } = await req.json();

    if (!sessionId) return errorResponse("Missing sessionId", 400);
    if (!systemPrompt || !userPrompt) return errorResponse("Missing systemPrompt or userPrompt", 400);

    const ctx = await createAIContext(sessionId, turnNumber);

    const result = await invokeAI(ctx, {
      model,
      systemPrompt,
      userPrompt,
      tools,
      toolChoice,
      maxTokens,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error, debug: result.debug }, result.status || 500);
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("ai-invoke error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
