/**
 * ROUTE UPKEEP — physical lifecycle here, gold NEVER here.
 *
 * FISCAL BOUNDARY: route maintenance is a per-turn recurring expense, so it must
 * be charged by the single authoritative turn-fiscal writer (process-turn) and
 * therefore appear in the turn ledger / fiscal snapshot. world-layer-tick owns
 * only the physical lifecycle (maintenance level, lifecycle state, events) and
 * stamps `route_state.last_maintained_turn` for the routes it decided to service.
 * process-turn then reads those stamps back and charges exactly that amount, so
 * the treasury delta and the snapshot always agree.
 *
 * Idempotence: the plan is a pure function of (route_state, owners, gold), and
 * world-layer-tick guards itself per (session, turn) so a retried turn neither
 * decays twice nor charges twice.
 */

export type RouteStateRow = {
  route_id: string;
  session_id: string;
  lifecycle_state: string;
  maintenance_level: number;
  quality_level: number;
  last_maintained_turn: number;
  upkeep_cost: number;
  turns_unpaid?: number | null;
};

export function deriveLifecycle(maintenance: number, prev: string): string {
  // 'planned' / 'under_construction' are externally driven, leave them alone.
  if (prev === "planned" || prev === "under_construction") return prev;
  if (maintenance >= 80) return "maintained";
  if (maintenance >= 30) return "usable";
  if (maintenance >= 10) return "degraded";
  return "blocked";
}

export function lifecycleToCacheControl(lifecycle: string): string {
  switch (lifecycle) {
    case "blocked": return "blocked";
    case "degraded": return "contested";
    case "under_construction":
    case "planned": return "constructing";
    default: return "open";
  }
}

export type RoutePlanInput = {
  sessionId: string;
  turnNumber: number;
  /** owner per route_id; missing/empty owner = orphan route (decays, never charged) */
  ownerOf: (routeId: string) => string | null | undefined;
  /** treasury currently available to an owner (read-only affordability check) */
  goldOf: (owner: string) => number;
  states: RouteStateRow[];
};

export type RoutePlan = {
  stateUpdates: Array<Record<string, unknown>>;
  cacheUpdates: Array<{ id: string; control: string }>;
  events: Array<Record<string, unknown>>;
  /** gold that process-turn must charge this turn, per owner */
  upkeepByOwner: Record<string, number>;
  maintained: number;
  degraded: number;
  blocked: number;
};

export function planRouteMaintenance(input: RoutePlanInput): RoutePlan {
  const { sessionId, turnNumber, states, ownerOf, goldOf } = input;
  const plan: RoutePlan = {
    stateUpdates: [], cacheUpdates: [], events: [], upkeepByOwner: {},
    maintained: 0, degraded: 0, blocked: 0,
  };

  const byOwner = new Map<string, RouteStateRow[]>();
  const orphan: RouteStateRow[] = [];
  for (const s of states) {
    const owner = ownerOf(s.route_id);
    if (!owner) { orphan.push(s); continue; }
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(s);
  }

  for (const [owner, ownerStates] of Array.from(byOwner.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    let goldAvail = Number(goldOf(owner) ?? 0);
    let charged = 0;

    for (const s of ownerStates.slice().sort((a, b) => a.route_id.localeCompare(b.route_id))) {
      let nextMaint = Math.max(0, s.maintenance_level - 5);
      let lastMaintTurn = s.last_maintained_turn;
      let nextUnpaid = s.turns_unpaid ?? 0;

      if (goldAvail >= s.upkeep_cost && nextMaint < 100) {
        goldAvail -= s.upkeep_cost;
        charged += s.upkeep_cost;
        nextMaint = Math.min(100, nextMaint + 15);
        lastMaintTurn = turnNumber;
        nextUnpaid = 0;
      } else if (s.upkeep_cost > 0) {
        nextUnpaid += 1;
      }

      const prevLifecycle = s.lifecycle_state;
      let nextLifecycle = deriveLifecycle(nextMaint, prevLifecycle);
      if (nextUnpaid >= 3 && nextLifecycle === "degraded") nextLifecycle = "blocked";

      plan.stateUpdates.push({
        route_id: s.route_id,
        session_id: sessionId,
        lifecycle_state: nextLifecycle,
        maintenance_level: nextMaint,
        quality_level: s.quality_level,
        last_maintained_turn: lastMaintTurn,
        upkeep_cost: s.upkeep_cost,
        turns_unpaid: nextUnpaid,
        updated_at: new Date().toISOString(),
      });
      plan.cacheUpdates.push({ id: s.route_id, control: lifecycleToCacheControl(nextLifecycle) });

      if (prevLifecycle !== nextLifecycle) {
        if (nextLifecycle === "blocked") {
          plan.blocked++;
          plan.events.push({
            session_id: sessionId, turn_number: turnNumber, event_type: "route_blocked", severity: "warning",
            title: "Trasa zablokována",
            description: `Trasa ${s.route_id.slice(0, 8)} zkolabovala kvůli zanedbané údržbě (${nextUnpaid} tahů bez platby).`,
            metadata: { route_id: s.route_id, owner, maintenance: nextMaint, turns_unpaid: nextUnpaid },
          });
        } else if (nextLifecycle === "degraded") {
          plan.degraded++;
          plan.events.push({
            session_id: sessionId, turn_number: turnNumber, event_type: "route_decay", severity: "info",
            title: "Trasa chátrá",
            description: `Trasa ${s.route_id.slice(0, 8)} potřebuje opravu.`,
            metadata: { route_id: s.route_id, owner, maintenance: nextMaint },
          });
        } else if (nextLifecycle === "maintained") {
          plan.maintained++;
        }
      }
    }
    if (charged > 0) plan.upkeepByOwner[owner] = charged;
  }

  for (const s of orphan) {
    const nextMaint = Math.max(0, s.maintenance_level - 5);
    const nextLifecycle = deriveLifecycle(nextMaint, s.lifecycle_state);
    plan.stateUpdates.push({
      route_id: s.route_id, session_id: sessionId, lifecycle_state: nextLifecycle,
      maintenance_level: nextMaint, quality_level: s.quality_level,
      last_maintained_turn: s.last_maintained_turn, upkeep_cost: s.upkeep_cost,
      updated_at: new Date().toISOString(),
    });
    plan.cacheUpdates.push({ id: s.route_id, control: lifecycleToCacheControl(nextLifecycle) });
  }

  return plan;
}

/**
 * Amount process-turn must charge a realm for route maintenance in `turnNumber`.
 * Derived from the physical stamps written by world-layer-tick — never from a
 * parallel fiscal ledger.
 */
export async function routeUpkeepDueThisTurn(
  sb: any,
  sessionId: string,
  playerName: string,
  turnNumber: number,
): Promise<number> {
  const { data: routes } = await sb.from("province_routes")
    .select("id").eq("session_id", sessionId).eq("controlled_by", playerName);
  const ids = (routes || []).map((r: any) => r.id);
  if (!ids.length) return 0;
  const { data: states } = await sb.from("route_state")
    .select("route_id, upkeep_cost, last_maintained_turn")
    .eq("session_id", sessionId)
    .eq("last_maintained_turn", turnNumber)
    .in("route_id", ids);
  return (states || []).reduce((sum: number, s: any) => sum + Math.max(0, Number(s.upkeep_cost) || 0), 0);
}
