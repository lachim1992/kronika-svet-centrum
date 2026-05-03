/**
 * Wave 2 — SHADOW valid_actions generator.
 * Engine-side enumeration of legal actions with cost, expected effect, score.
 * NOT consumed by AI yet. Telemetry only.
 */

export type ActionType =
  | "RECRUIT_ARMY" | "BUILD_BUILDING" | "MOVE_ARMY" | "ATTACK_TARGET"
  | "FORTIFY_NODE" | "REPAIR_ROUTE" | "OPEN_TRADE_WITH_NODE"
  | "ANNEX_NODE" | "HOLD_POSITION";

export type ValidAction = {
  action_id: string;
  type: ActionType;
  label: string;
  params: Record<string, any>;
  cost: { gold?: number; production?: number; manpower?: number; grain?: number };
  expected: string;
  score: number; // 0..100
};

function hexDist(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs((-q1 - r1) - (-q2 - r2))) / 2;
}

export function generateValidActions(input: {
  factionName: string;
  resources: { gold: number; grain: number; production: number; manpower: number; manpowerCommitted: number; faith: number };
  realmRes: any;
  milMetrics: any;
  cities: any[];
  affordableBuildings: string[];
  strategicNodes: any[];
  strategicRoutes: any[];
  supplyStates: any[];
  influenceByNode?: Map<string, any>;
  rivalsByNode?: Map<string, { count: number; topPressure: number }>;
}): ValidAction[] {
  const out: ValidAction[] = [];
  const f = input.factionName;
  const mm = input.milMetrics || {};
  const atWar = mm.warState === "war";
  const tension = mm.warState === "tension";
  const myCities = input.cities || [];
  const myNodes = (input.strategicNodes || []).filter((n: any) => n.controlled_by === f);

  // RECRUIT_ARMY (per city) — militia preset baseline
  const militiaCost = { gold: 32, production: 20, manpower: 80 };
  const canMilitia = input.resources.gold >= militiaCost.gold &&
                     input.resources.production >= militiaCost.production &&
                     input.resources.manpower >= militiaCost.manpower;
  if (canMilitia) {
    for (const c of myCities.slice(0, 3)) {
      const score = atWar ? 80 : tension ? 60 : (mm.totalArmyPower || 0) < 100 ? 70 : 40;
      out.push({
        action_id: `RECRUIT:militia:${c.id}`,
        type: "RECRUIT_ARMY",
        label: `Verbovat militii v ${c.name}`,
        params: { cityId: c.id, preset: "militia", manpower: 80 },
        cost: militiaCost,
        expected: "+power ~80, -manpower 80",
        score,
      });
    }
  }

  // BUILD_BUILDING (per affordable × per city)
  for (const bname of (input.affordableBuildings || []).slice(0, 5)) {
    for (const c of myCities.slice(0, 3)) {
      const tag = /wall|hradb|fort/i.test(bname) ? "defense"
                : /market|trh/i.test(bname) ? "economy"
                : /granary|sýp/i.test(bname) ? "food"
                : "general";
      const score = (atWar && tag === "defense") ? 75
                  : (!atWar && tag === "economy") ? 65
                  : (input.resources.grain < 50 && tag === "food") ? 70
                  : 45;
      out.push({
        action_id: `BUILD:${bname}:${c.id}`,
        type: "BUILD_BUILDING",
        label: `Postavit ${bname} v ${c.name}`,
        params: { cityId: c.id, buildingName: bname },
        cost: { production: 50, gold: 50 },
        expected: `+${tag}`,
        score,
      });
    }
  }

  // MOVE_ARMY / ATTACK_TARGET — towards suggestedTargets
  const deployed = mm.deployedStacks || [];
  const targets = mm.suggestedTargets || [];
  for (const stack of deployed.slice(0, 3)) {
    for (const tgt of targets.slice(0, 2)) {
      const d = hexDist(stack.hexQ, stack.hexR, tgt.hexQ, tgt.hexR);
      if (d <= 1 && atWar) {
        out.push({
          action_id: `ATTACK:${stack.id}:${tgt.name}`,
          type: "ATTACK_TARGET",
          label: `Útok ${stack.name} → ${tgt.name}`,
          params: { stackId: stack.id, targetCity: tgt.name },
          cost: {},
          expected: "bitva",
          score: 90,
        });
      } else if (d > 1 && d <= 12 && !stack.movedThisTurn) {
        out.push({
          action_id: `MOVE:${stack.id}:${tgt.hexQ},${tgt.hexR}`,
          type: "MOVE_ARMY",
          label: `Posun ${stack.name} → ${tgt.name}`,
          params: { stackId: stack.id, targetHexQ: tgt.hexQ, targetHexR: tgt.hexR },
          cost: {},
          expected: "přiblížení k cíli",
          score: atWar ? 70 : 30,
        });
      }
    }
  }

  // FORTIFY_NODE — high-traffic unfortified own nodes
  const fortifyTargets = myNodes.filter((n: any) =>
    (n.cumulative_trade_flow || 0) > 20 && (n.fortification_level || 0) < 1
  );
  for (const n of fortifyTargets.slice(0, 3)) {
    out.push({
      action_id: `FORTIFY:${n.id}`,
      type: "FORTIFY_NODE",
      label: `Fortifikovat ${n.name}`,
      params: { targetNodeName: n.name },
      cost: { production: 80 },
      expected: "+defense_level",
      score: atWar ? 60 : 50,
    });
  }

  // REPAIR_ROUTE — damaged/blocked routes touching own nodes
  const myNodeIds = new Set(myNodes.map((n: any) => n.id));
  const damaged = (input.strategicRoutes || []).filter((r: any) =>
    (r.control_state === "damaged" || r.control_state === "blocked") &&
    (myNodeIds.has(r.node_a) || myNodeIds.has(r.node_b))
  );
  for (const r of damaged.slice(0, 3)) {
    out.push({
      action_id: `REPAIR:${r.id}`,
      type: "REPAIR_ROUTE",
      label: `Opravit cestu ${r.id.substring(0, 8)}`,
      params: { routeId: r.id },
      cost: { production: 40 },
      expected: "obnoví flow",
      score: 55,
    });
  }

  // OPEN_TRADE_WITH_NODE — discovered neutral nodes without dominant rival
  const neutrals = (input.strategicNodes || []).filter((n: any) => n.is_neutral && n.discovered);
  for (const n of neutrals.slice(0, 3)) {
    const rivals = input.rivalsByNode?.get(n.id);
    if (rivals && rivals.topPressure > 50) continue;
    out.push({
      action_id: `OPEN_TRADE:${n.id}`,
      type: "OPEN_TRADE_WITH_NODE",
      label: `Otevřít obchod s ${n.name}`,
      params: { targetNodeName: n.name },
      cost: { gold: 20 },
      expected: "+economic_influence",
      score: atWar ? 25 : 55,
    });
  }

  // ANNEX_NODE — ANNEX_READY neutrals
  for (const n of neutrals) {
    const inf = input.influenceByNode?.get(n.id);
    if (!inf) continue;
    const myPressure = (inf.economic_influence || 0) * 0.45 +
                       (inf.political_influence || 0) * 0.35 +
                       (inf.military_pressure || 0) * 0.20;
    const threshold = (inf.resistance || 0) + (n.autonomy_score ?? 80) * 0.5;
    const rivals = input.rivalsByNode?.get(n.id);
    const contested = !!(rivals && myPressure > 0 && rivals.topPressure >= myPressure * 0.6);
    if (myPressure >= threshold && !contested) {
      out.push({
        action_id: `ANNEX:${n.id}`,
        type: "ANNEX_NODE",
        label: `Anexovat ${n.name}`,
        params: { targetNodeName: n.name },
        cost: {},
        expected: "získá uzel",
        score: 95,
      });
    }
  }

  // HOLD_POSITION — always present as fallback
  out.push({
    action_id: "HOLD",
    type: "HOLD_POSITION",
    label: "Žádná akce",
    params: {},
    cost: {},
    expected: "no-op",
    score: 1,
  });

  return out;
}
