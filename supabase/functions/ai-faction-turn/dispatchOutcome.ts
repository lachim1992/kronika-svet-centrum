/** Maps a command-dispatch response to an AI action result: refused commands are never reported "ok". */
export function dispatchOutcome(res: unknown): string {
  const r = res as { ok?: boolean; error?: unknown } | null;
  if (r && (r.ok === false || (typeof r.error === "string" && r.error))) {
    return `rejected: ${String(r.error ?? "command refused").slice(0, 160)}`;
  }
  return "ok";
}
