/**
 * DERIVED ECONOMY CHAIN — single definition (Phase 5).
 *
 * commit-turn (turn resolution) and refresh-economy (manual recompute) used to
 * keep two hand-maintained copies of the same six-step chain, which drifted.
 * Both now build their step list here, so the order and the bodies can only
 * change in one place.
 *
 * OWNERSHIP: every step in this chain is PHYSICAL / DERIVED.
 * No treasury writes, no population writes, no history rows.
 */
export interface DerivedStep {
  name: string;
  fn: string;
  body: Record<string, unknown>;
}

export interface DerivedChainOptions {
  sessionId: string;
  /**
   * Turn the goods projection belongs to. commit-turn passes the NEW turn
   * (turnNumber + 1); refresh-economy leaves it out and the solver uses the
   * session's current turn.
   */
  goodsTurn?: number;
  /** Trade-system events are emitted during turn resolution only. */
  emitEvents?: boolean;
  /**
   * "physical" → aggregate physical totals before the fiscal writer (commit-turn).
   * "final"    → post-fiscal aggregation. undefined → plain recompute (refresh).
   */
  aggregatePhase?: "physical" | "final";
  /** Set false when the caller aggregates separately. */
  includeAggregation?: boolean;
}

export function derivedChainSteps(opts: DerivedChainOptions): DerivedStep[] {
  const session_id = opts.sessionId;
  const steps: DerivedStep[] = [
    { name: "compute-province-routes", fn: "compute-province-routes", body: { session_id } },
    { name: "compute-hex-flows", fn: "compute-hex-flows", body: { session_id, force_all: true } },
    {
      name: "compute-trade-systems", fn: "compute-trade-systems",
      body: { session_id, ...(opts.emitEvents ? { emit_events: true } : {}) },
    },
    {
      name: "compute-trade-flows", fn: "compute-trade-flows",
      body: { session_id, ...(opts.goodsTurn !== undefined ? { turn_number: opts.goodsTurn } : {}) },
    },
    { name: "compute-basket-trade-flows", fn: "compute-basket-trade-flows", body: { session_id } },
    { name: "compute-economy-flow", fn: "compute-economy-flow", body: { session_id } },
  ];

  if (opts.includeAggregation !== false) {
    steps.push({
      name: opts.aggregatePhase
        ? `aggregate-realm-totals(${opts.aggregatePhase})`
        : "aggregate-realm-totals",
      fn: "aggregate-realm-totals",
      body: { session_id, ...(opts.aggregatePhase ? { phase: opts.aggregatePhase } : {}) },
    });
  }

  return steps;
}
