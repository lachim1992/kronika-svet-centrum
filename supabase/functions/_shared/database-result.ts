// PostgREST resolves failed queries too. Never publish a successful projection
// after a required query failed; let the orchestrator stop dependent phases.
export function checkDb(result: { error: { message: string } | null }, operation: string) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
}
