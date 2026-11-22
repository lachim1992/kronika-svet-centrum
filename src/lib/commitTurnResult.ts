// HTTP success alone does not mean every phase of a committed turn succeeded.
export interface TurnPhaseResult {
  ok?: boolean;
  error?: string;
  failures?: { name: string; error: string }[];
  steps?: { name: string; ok: boolean; detail?: string }[];
}

export interface TurnResult {
  ok?: boolean;
  error?: string;
  newTurn?: number;
  results?: Record<string, TurnPhaseResult>;
}

// A conflict is not proof that the calendar advanced; older servers return an
// ambiguous 409 for running/interrupted turns. Fail closed unless explicitly stale.
export function getCommitTurnConflict(body: { code?: string; error?: string } | null): {
  changed: boolean;
  message: string;
} {
  if (body?.code === "TURN_CHANGED") {
    return { changed: true, message: body.error || "Tah se mezitím změnil. Stav hry byl obnoven." };
  }
  return {
    changed: false,
    message: body?.error || "Zpracování tahu je blokováno nebo předchozí pokus vyžaduje opravu. Tah nebyl opakován.",
  };
}

export function getCommitTurnIssues(result: TurnResult | null | undefined): string[] {
  if (!result) return ["Server nevrátil výsledek tahu."];
  const issues: string[] = [];
  if (result.error) issues.push(result.error);
  for (const [name, phase] of Object.entries(result.results || {})) {
    if (phase.error) issues.push(`${name}: ${phase.error}`);
    else if (phase.ok === false) issues.push(`${name}: fáze selhala`);
    for (const failure of phase.failures || []) issues.push(`${name}/${failure.name}: ${failure.error}`);
    for (const step of phase.steps || []) {
      if (!step.ok) issues.push(`${name}/${step.name}: ${step.detail || "krok selhal"}`);
    }
  }
  if (result.ok !== true && issues.length === 0) issues.push("Server nepotvrdil úspěšné dokončení tahu.");
  return issues;
}
