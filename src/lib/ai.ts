import { supabase } from "@/integrations/supabase/client";

export async function generateChronicle(
  events: any[],
  memories: any[],
  epochStyle: string,
  entityTraits?: any[],
  cityMemories?: any[]
): Promise<{ chronicle: string; suggestedMemories: string[] }> {
  const { data, error } = await supabase.functions.invoke("chronicle", {
    body: { events, memories, epochStyle, entityTraits: entityTraits || [], cityMemories: cityMemories || [] },
  });

  if (error) {
    console.error("Chronicle generation error:", error);
    return { chronicle: "Kronikář selhal...", suggestedMemories: [] };
  }

  return data;
}

export async function generateCityStateActions(
  cityStates: any[],
  recentEvents: any[]
): Promise<{ actions: Array<{ cityStateName: string; action: string; type: string; targetPlayer?: string }> }> {
  const { data, error } = await supabase.functions.invoke("citystates", {
    body: { cityStates, recentEvents },
  });

  if (error) {
    console.error("City state generation error:", error);
    return { actions: [] };
  }

  return data;
}

export async function generateWonder(
  prompt: string,
  city: string,
  era: string,
  worldFacts: string[]
): Promise<{ wonderName: string; description: string; memoryFact: string; bonusEffect?: string; imagePrompt: string }> {
  const { data, error } = await supabase.functions.invoke("wonder", {
    body: { prompt, city, era, worldFacts },
  });

  if (error) {
    console.error("Wonder generation error:", error);
    return { wonderName: "Neznámý div", description: "Kronikář selhal...", memoryFact: "", imagePrompt: "" };
  }

  return data;
}

export async function generateCityProfile(
  city: {
    name: string;
    ownerName: string;
    level: string;
    province: string;
    tags: string[];
    foundedRound?: number;
    status?: string;
    ownerFlavorPrompt?: string | null;
  },
  confirmedCityEvents: any[],
  approvedWorldFacts: string[],
  cityMemories?: any[],
  provinceMemories?: any[]
): Promise<{ introduction: string; historyRetelling: string; bulletFacts: string[]; debug?: any }> {
  const { data, error } = await supabase.functions.invoke("cityprofile", {
    body: { city, confirmedCityEvents, approvedWorldFacts, cityMemories: cityMemories || [], provinceMemories: provinceMemories || [] },
  });

  if (error) {
    console.error("City profile generation error:", error);
    return { introduction: "Kronikář selhal...", historyRetelling: "", bulletFacts: [] };
  }

  return data;
}

export async function extractEventsFromText(
  text: string,
  sessionId: string
): Promise<{ detectedEvents: any[] }> {
  const { data, error } = await supabase.functions.invoke("extract-events", {
    body: { text, sessionId },
  });

  if (error) {
    console.error("Event extraction error:", error);
    return { detectedEvents: [] };
  }

  return data;
}

export async function runWorldTick(
  sessionId: string,
  turnNumber: number
): Promise<{ ok: boolean; alreadyProcessed?: boolean; tickId?: string; results?: any; error?: string }> {
  const { data, error } = await supabase.functions.invoke("world-tick", {
    body: { sessionId, turnNumber },
  });

  if (error) {
    // Try to read response body from FunctionsHttpError context
    try {
      let body: any = null;
      if (error.context && typeof error.context === "object" && "json" in error.context) {
        body = await (error.context as Response).json();
      } else {
        // Fallback: try regex on message
        const msg = error.message || "";
        const jsonMatch = msg.match(/\{[\s\S]*\}/);
        if (jsonMatch) body = JSON.parse(jsonMatch[0]);
      }
      if (body?.error === "Tick already processed") {
        return { ok: false, alreadyProcessed: true, tickId: body.tickId };
      }
    } catch { /* parsing failed, fall through */ }
    console.error("World tick error:", error);
    return { ok: false, error: error.message || "Unknown error" };
  }

  return data;
}
