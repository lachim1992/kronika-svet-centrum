import { supabase } from "@/integrations/supabase/client";
import type { Scenario } from "@/lib/scenarioSandbox";
import type { BattleSimulationResult, ExtractionSimulationResult } from "../../supabase/functions/scenario-simulate/simulate";

export type ScenarioSimulationResult = BattleSimulationResult | ExtractionSimulationResult;

export async function runScenarioSimulation(kind: "battle" | "extraction", scenario: Scenario, attackerId?: string): Promise<ScenarioSimulationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("scenario-simulate", { body: { kind, scenario, attackerId } });
    if (error) {
      let message = error.message;
      try {
        if (error.context && typeof error.context === "object" && "json" in error.context) {
          const body = await (error.context as Response).json();
          message = body?.error || message;
        }
      } catch { /* retain the original message */ }
      throw new Error(message);
    }
    if (!data?.ok) throw new Error(data?.error || "Simulace selhala");
    return data.result as ScenarioSimulationResult;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Spojení se simulací selhalo");
  }
}
