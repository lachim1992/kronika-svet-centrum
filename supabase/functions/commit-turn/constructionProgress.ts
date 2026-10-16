/** One construction step per closed turn; returns null when this turn already advanced the project (retry). */
export function constructionStep(progress: unknown, level: unknown, lastProgressTurn: unknown, turn: number) {
  if (lastProgressTurn != null && Number(lastProgressTurn) >= turn) return null;
  const lvl = Math.max(1, Number(level || 1));
  const next = Math.min(100, Number(progress || 0) + Math.ceil(100 / lvl));
  return { progress: next, complete: next >= 100 };
}

/** PostgREST filter: only rows not yet advanced in `turn`. */
export const notAdvancedIn = (turn: number) => `last_progress_turn.is.null,last_progress_turn.lt.${turn}`;
