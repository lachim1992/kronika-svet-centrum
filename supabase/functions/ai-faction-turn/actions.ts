/**
 * Wave 2 — SHADOW valid_actions generator (Inc 2.5).
 * Engine-side enumeration of legal actions with cost, expected effect, score.
 * NOT consumed by AI yet. Telemetry only.
 */

export type ActionType =
  | "RECRUIT_ARMY" | "BUILD_BUILDING" | "MOVE_ARMY" | "ATTACK_TARGET"
  | "FORTIFY_NODE" | "REPAIR_ROUTE" | "OPEN_TRADE_WITH_NODE"
  | "ANNEX_NODE" | "HOLD_POSITION"
  | "OFFER_PEACE" | "SEND_DIPLOMACY_MESSAGE" | "PROPOSE_TRADE";

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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
  // Inc 2.5 extras (all optional for back-compat)
  enemyStacks?: Array<{ id?: string; player_name?: string; hexQ?: number; hexR?: number; power?: number }>;
  activeWars?: Array<{ declaring_player?: string; target_player?: string; declared_turn?: number }>;
  peaceOffers?: Array<{ peace_offered_by?: string; peace_conditions?: any; declaring_player?: string; target_player?: string }>;
  allTensionData?: Array<{ player_a?: string; player_b?: string; total_tension?: number }>;
  tradeRoutes?: Array<{ player_a?: string; player_b?: string }>;
  allFactions?: Array<{ faction_name?: string }>;
  turn?: number;
}): ValidAction[] {
  const out: ValidAction[] = [];
  const f = input.factionName;
  const mm = input.milMetrics || {};
  const atWar = mm.warState === "war";
  const tension = mm.warState === "tension";
  const peace = !atWar && !tension;
  const myCities = input.cities || [];
  const myNodes = (input.strategicNodes || []).filter((n: any) => n.controlled_by === f);
  const ownPower = mm.totalArmyPower || 0;
  const enemyPower = mm.enemyVisiblePower || 0;
  const losing = atWar && enemyPower > ownPower * 1.2;

  // ─── RECRUIT_ARMY: militia preset ───
  const militiaCost = { gold: 32, production: 20, manpower: 80 };
  const canMilitia = input.resources.gold >= militiaCost.gold &&
                     input.resources.production >= militiaCost.production &&
                     input.resources.manpower >= militiaCost.manpower;
  if (canMilitia) {
    for (const c of myCities.slice(0, 3)) {
      const score = atWar ? 80 : tension ? 60 : ownPower < 100 ? 70 : 40;
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

  // ─── RECRUIT_ARMY: emergency_militia (Inc 2.5) ───
  // Lower thresholds for war/low-power factions when manpower pool is depleted.
  const emergencyCost = { gold: 12, production: 8, manpower: 30 };
  const canEmergency = input.resources.gold >= emergencyCost.gold &&
                       input.resources.production >= emergencyCost.production &&
                       input.resources.manpower >= emergencyCost.manpower;
  if (canEmergency && !canMilitia) {
    // Only emit when full militia is unaffordable (avoid noise)
    for (const c of myCities.slice(0, 2)) {
      const score = (atWar && losing) ? 90
                  : atWar ? 75
                  : tension ? 55
                  : ownPower < enemyPower ? 60
                  : 25;
      out.push({
        action_id: `RECRUIT:emergency:${c.id}`,
        type: "RECRUIT_ARMY",
        label: `Nouzová milice v ${c.name}`,
        params: { cityId: c.id, preset: "emergency_militia", manpower: 30 },
        cost: emergencyCost,
        expected: "+power ~30, levný nouzový draft",
        score,
      });
    }
  }

  // ─── BUILD_BUILDING with score variation (Inc 2.5) ───
  // Diversify scoring by: city size, war state, building category, deficits, slot occupancy.
  const grainDeficit = input.resources.grain < 50;
  const goldDeficit = input.resources.gold < 50;
  for (const bname of (input.affordableBuildings || []).slice(0, 5)) {
    const cat = /wall|hradb|fort|tower|brán|gate/i.test(bname) ? "defense"
              : /market|trh|bazaar|shop/i.test(bname) ? "economy"
              : /granary|sýp|farm|mill|mlýn/i.test(bname) ? "food"
              : /barracks|kasárna|smith|kovár/i.test(bname) ? "military"
              : /temple|chrám|shrine/i.test(bname) ? "faith"
              : "general";
    for (let i = 0; i < Math.min(myCities.length, 3); i++) {
      const c = myCities[i];
      const pop = Number(c.population || c.pop || 100);
      const popBonus = clamp(Math.round((pop - 100) / 50), -10, 15);
      const slots = Number(c.building_slots_used || 0);
      const crowdPenalty = slots > 8 ? -10 : 0;
      let base = 45;
      if (atWar && cat === "defense") base = 78;
      else if (atWar && cat === "military") base = 70;
      else if (atWar && cat === "economy") base = 30;
      else if (peace && cat === "economy") base = 68;
      else if (grainDeficit && cat === "food") base = 75;
      else if (goldDeficit && cat === "economy") base = 65;
      else if (cat === "faith") base = 50;
      // Front-distance modifier: prioritize defense closer to suggested targets / enemy stacks.
      let frontMod = 0;
      const cQ = c.hex_q ?? c.hexQ;
      const cR = c.hex_r ?? c.hexR;
      if (cat === "defense" && cQ != null && cR != null) {
        const enemies = (input.enemyStacks || []).concat(mm.suggestedTargets || []);
        let nearest = Infinity;
        for (const e of enemies) {
          const eQ = e.hexQ ?? e.hex_q;
          const eR = e.hexR ?? e.hex_r;
          if (eQ == null || eR == null) continue;
          const d = hexDist(cQ, cR, eQ, eR);
          if (d < nearest) nearest = d;
        }
        if (nearest <= 3) frontMod = 12;
        else if (nearest <= 6) frontMod = 5;
        else if (nearest > 12) frontMod = -8;
      }
      // Per-position jitter (deterministic) so scores are not identical:
      const jitter = ((bname.length * 13 + i * 7 + (c.name?.length || 0)) % 9) - 4;
      const score = clamp(base + popBonus + crowdPenalty + frontMod + jitter, 1, 99);
      out.push({
        action_id: `BUILD:${bname}:${c.id}`,
        type: "BUILD_BUILDING",
        label: `Postavit ${bname} v ${c.name}`,
        params: { cityId: c.id, buildingName: bname },
        cost: { production: 50, gold: 50 },
        expected: `+${cat}`,
        score,
      });
    }
  }

  // ─── MOVE_ARMY / ATTACK_TARGET — primary path via suggestedTargets ───
  const deployed: any[] = mm.deployedStacks || [];
  const targets: any[] = mm.suggestedTargets || [];
  const movedTargets = new Set<string>();
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
        movedTargets.add(stack.id);
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
        movedTargets.add(stack.id);
      }
    }
  }

  // ─── MOVE/ATTACK FALLBACK (Inc 2.5) ───
  // If no suggestedTargets but we're in war/tension and there are visible enemy stacks,
  // generate move-toward-nearest-enemy or move-to-defend-vulnerable-city.
  if ((atWar || tension) && (input.enemyStacks?.length || 0) > 0) {
    for (const stack of deployed.slice(0, 3)) {
      if (movedTargets.has(stack.id) || stack.movedThisTurn) continue;
      // nearest enemy
      let nearest: any = null;
      let bestD = Infinity;
      for (const es of (input.enemyStacks || [])) {
        const eQ = es.hexQ ?? (es as any).hex_q;
        const eR = es.hexR ?? (es as any).hex_r;
        if (eQ == null || eR == null) continue;
        const d = hexDist(stack.hexQ, stack.hexR, eQ, eR);
        if (d < bestD) { bestD = d; nearest = { ...es, hexQ: eQ, hexR: eR }; }
      }
      if (nearest && bestD <= 14) {
        if (bestD <= 1 && atWar) {
          out.push({
            action_id: `ATTACK_FB:${stack.id}:${nearest.player_name}`,
            type: "ATTACK_TARGET",
            label: `Útok ${stack.name} na ${nearest.player_name || "nepřítele"}`,
            params: { stackId: stack.id, targetEnemyStackId: nearest.id, targetHexQ: nearest.hexQ, targetHexR: nearest.hexR },
            cost: {},
            expected: "bitva s nepřátelským stackem",
            score: 88,
          });
        } else {
          out.push({
            action_id: `MOVE_FB:${stack.id}:${nearest.hexQ},${nearest.hexR}`,
            type: "MOVE_ARMY",
            label: `Postup ${stack.name} k nepříteli (${nearest.player_name || "?"})`,
            params: { stackId: stack.id, targetHexQ: nearest.hexQ, targetHexR: nearest.hexR },
            cost: {},
            expected: "intercept nepřítele",
            score: atWar ? 72 : 50,
          });
        }
        movedTargets.add(stack.id);
      } else if ((mm.vulnerableCities || []).length > 0) {
        // Defend nearest vulnerable own city
        const v = mm.vulnerableCities[0];
        if (v.hexQ != null && v.hexR != null) {
          out.push({
            action_id: `MOVE_DEF:${stack.id}:${v.hexQ},${v.hexR}`,
            type: "MOVE_ARMY",
            label: `Bránit ${v.name} stackem ${stack.name}`,
            params: { stackId: stack.id, targetHexQ: v.hexQ, targetHexR: v.hexR },
            cost: {},
            expected: "posílí garnison",
            score: atWar ? 68 : 45,
          });
        }
      }
    }
  }

  // ─── FORTIFY_NODE — high-traffic unfortified own nodes ───
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

  // ─── REPAIR_ROUTE ───
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

  // ─── OPEN_TRADE_WITH_NODE ───
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

  // ─── ANNEX_NODE ───
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

  // ─── DIPLOMACY (Inc 2.5) ───
  const wars = input.activeWars || [];
  const turn = input.turn || 0;
  // OFFER_PEACE
  for (const w of wars) {
    const enemy = w.declaring_player === f ? w.target_player : w.declaring_player;
    if (!enemy) continue;
    const warAge = turn - (w.declared_turn || turn);
    let score = 30;
    if (losing) score = 85;
    else if (warAge >= 6) score = 65;
    else if (warAge >= 3) score = 50;
    out.push({
      action_id: `OFFER_PEACE:${enemy}`,
      type: "OFFER_PEACE",
      label: `Nabídnout mír ${enemy}`,
      params: { targetFaction: enemy },
      cost: {},
      expected: "ukončení války",
      score,
    });
  }
  // Accept-pending peace offers explicitly listed
  for (const po of (input.peaceOffers || [])) {
    const from = po.peace_offered_by || po.declaring_player || po.target_player;
    if (!from) continue;
    out.push({
      action_id: `ACCEPT_PEACE:${from}`,
      type: "OFFER_PEACE",
      label: `Přijmout mír od ${from}`,
      params: { targetFaction: from, accept: true },
      cost: {},
      expected: "okamžitý mír",
      score: losing ? 92 : 75,
    });
  }
  // SEND_DIPLOMACY_MESSAGE — when in war/tension and no military action was emitted
  const hasMilitary = out.some(a => ["MOVE_ARMY","ATTACK_TARGET","RECRUIT_ARMY"].includes(a.type));
  if ((atWar || tension) && !hasMilitary) {
    const opponents = wars.map(w => w.declaring_player === f ? w.target_player : w.declaring_player).filter(Boolean) as string[];
    const tensionFoes = (input.allTensionData || [])
      .filter(t => (t.player_a === f || t.player_b === f) && (t.total_tension || 0) > 30)
      .map(t => t.player_a === f ? t.player_b : t.player_a)
      .filter(Boolean) as string[];
    const targetsList = Array.from(new Set([...opponents, ...tensionFoes])).slice(0, 2);
    for (const op of targetsList) {
      out.push({
        action_id: `DIPLO_MSG:${op}`,
        type: "SEND_DIPLOMACY_MESSAGE",
        label: `Diplomatická zpráva ${op}`,
        params: { targetFaction: op },
        cost: {},
        expected: "snížit napětí / signalizovat",
        score: 40,
      });
    }
  }
  // PROPOSE_TRADE — peace/tension only
  if (peace || tension) {
    const tradedWith = new Set<string>();
    for (const tr of (input.tradeRoutes || [])) {
      if (tr.player_a === f && tr.player_b) tradedWith.add(tr.player_b);
      if (tr.player_b === f && tr.player_a) tradedWith.add(tr.player_a);
    }
    const candidates = (input.allFactions || [])
      .map(x => x.faction_name)
      .filter((n): n is string => !!n && n !== f && !tradedWith.has(n))
      .slice(0, 2);
    for (const op of candidates) {
      out.push({
        action_id: `TRADE:${op}`,
        type: "PROPOSE_TRADE",
        label: `Navrhnout obchodní dohodu ${op}`,
        params: { targetFaction: op },
        cost: { gold: 10 },
        expected: "+wealth, +relations",
        score: peace ? 50 : 35,
      });
    }
  }

  // ─── HOLD_POSITION fallback ───
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
