// One projection pipeline for turn commits and explicit refreshes.
// These steps rebuild derived data; applying a turn's reserves belongs to process-turn.
export const ECONOMY_REFRESH_STEPS = [
  "compute-province-routes",
  "compute-hex-flows",
  // Recipes consume production_output and route_access_factor from this step.
  "compute-economy-flow",
  "compute-trade-systems",
  "compute-trade-flows",
  "compute-basket-trade-flows",
] as const;

export interface EconomyStepResult {
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
  skipped?: boolean;
}

type Invoke = (name: string, body: Record<string, unknown>) => Promise<{
  data?: unknown;
  error?: { message: string } | null;
}>;

export async function refreshEconomy(sessionId: string, invoke: Invoke) {
  const steps: EconomyStepResult[] = [];
  const warnings: string[] = [];
  let failedStep: string | undefined;

  for (const name of ECONOMY_REFRESH_STEPS) {
    if (failedStep) {
      steps.push({ name, ok: false, skipped: true, durationMs: 0, detail: `Blocked by ${failedStep}` });
      continue;
    }
    const start = Date.now();
    try {
      const body: Record<string, unknown> = { session_id: sessionId };
      if (name === "compute-hex-flows") body.force_all = true;
      const { data, error } = await invoke(name, body);
      if (error) throw new Error(error.message);
      const result = data as { ok?: boolean; error?: string } | null;
      // Supabase treats HTTP 207 as success. Inspect the application result too.
      if (result?.ok !== true || result?.error) {
        throw new Error(result?.error || "Step did not confirm success");
      }
      steps.push({ name, ok: true, durationMs: Date.now() - start, detail: JSON.stringify(data)?.slice(0, 300) });
    } catch (error) {
      failedStep = name;
      const detail = error instanceof Error ? error.message : String(error);
      steps.push({ name, ok: false, durationMs: Date.now() - start, detail });
      warnings.push(`${name}: ${detail}`);
    }
  }

  return {
    ok: !failedStep,
    session_id: sessionId,
    totalMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
    refreshed_domains: failedStep ? [] : ["routes", "flows", "economy", "trade"],
    steps,
    warnings,
  };
}
