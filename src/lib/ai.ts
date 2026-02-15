import { supabase } from "@/integrations/supabase/client";

export async function generateChronicle(
  events: any[],
  memories: any[],
  epochStyle: string,
  entityTraits?: any[]
): Promise<{ chronicle: string; suggestedMemories: string[] }> {
  const { data, error } = await supabase.functions.invoke("chronicle", {
    body: { events, memories, epochStyle, entityTraits: entityTraits || [] },
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
  approvedWorldFacts: string[]
): Promise<{ introduction: string; historyRetelling: string; bulletFacts: string[]; debug?: any }> {
  const { data, error } = await supabase.functions.invoke("cityprofile", {
    body: { city, confirmedCityEvents, approvedWorldFacts },
  });

  if (error) {
    console.error("City profile generation error:", error);
    return { introduction: "Kronikář selhal...", historyRetelling: "", bulletFacts: [] };
  }

  return data;
}
