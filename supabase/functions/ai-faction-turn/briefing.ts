/**
 * Wave 2 — SHADOW briefing builder.
 * Pure function: takes already-fetched data and returns a compact briefing.
 * NOT consumed by AI yet. Telemetry only.
 */

export type Briefing = {
  identity: {
    name: string;
    personality: string;
    myth: string;
    goals: string[];
    disposition: Record<string, number>;
  };
  resources: {
    gold: number; grain: number; faith: number;
    manpower: number; manpowerCommitted: number;
    production: number; wealth: number; capacity: number;
    legitimacy?: number;
  };
  military: {
    state: "peace" | "tension" | "war";
    readiness: number;
    ownPower: number;
    deployedPower: number;
    enemyVisiblePower: number;
    mobilization: { current: number; suggested: number; maxSafe: number };
    undeployedCount: number;
    deployedCount: number;
  };
  diplomacy: {
    factions: Array<{
      name: string; personality: string;
      tension: number; trust?: number;
      tradeRoutes: number; cities: number;
      myDisposition: number;
    }>;
    activeWars: Array<{ with: string; since: number }>;
    pendingPeace: Array<{ from: string; terms: any }>;
    ultimatumsSentTo: string[];
    recentMessages: Array<{ from: string; text: string }>;
  };
  problems: string[];
  opportunities: string[];
  threats: string[];
  memory: string[];
};

export function buildFactionBriefing(input: {
  factionName: string;
  faction: any;
  civ: any;
  turn: number;
  resources: { gold: number; grain: number; production: number; manpower: number; manpowerCommitted: number; faith: number };
  realmRes: any;
  milMetrics: any;
  cities: any[];
  allCities: any[];
  allFactions: any[];
  allTensionData: any[];
  tradeRoutes: any[];
  diplomRelations: any[];
  diplomMemories: any[];
  myPastActions: any[];
  activeWars: any[];
  peaceOffers: any[];
  recentMessages: any[];
  sentUltimatums: any[];
  strategicNodes: any[];
  supplyStates: any[];
  enemyStacks: any[];
}): Briefing {
  const f = input.factionName;
  const disp = input.faction?.disposition || {};

  const others = (input.allFactions || []).filter((x) => x.faction_name !== f);
  const factions = others.map((of: any) => {
    const ofCities = (input.allCities || []).filter((c: any) => c.owner_player === of.faction_name).length;
    const t = (input.allTensionData || []).find((x: any) =>
      (x.player_a === f && x.player_b === of.faction_name) ||
      (x.player_a === of.faction_name && x.player_b === f)
    );
    const trade = (input.tradeRoutes || []).filter((tr: any) =>
      (tr.player_a === f && tr.player_b === of.faction_name) ||
      (tr.player_a === of.faction_name && tr.player_b === f)
    ).length;
    const rel = (input.diplomRelations || []).find((r: any) =>
      (r.faction_a === f && r.faction_b === of.faction_name) ||
      (r.faction_a === of.faction_name && r.faction_b === f)
    );
    return {
      name: of.faction_name,
      personality: of.personality || "unknown",
      tension: Number(t?.total_tension || 0),
      trust: rel?.trust,
      tradeRoutes: trade,
      cities: ofCities,
      myDisposition: Number(disp[of.faction_name] ?? 0),
    };
  })
    .sort((a, b) => (Math.abs(b.tension) + Math.abs(b.myDisposition)) - (Math.abs(a.tension) + Math.abs(a.myDisposition)))
    .slice(0, 5);

  const problems: string[] = [];
  const supMap = new Map<string, any>();
  for (const s of (input.supplyStates || [])) if (!supMap.has(s.node_id)) supMap.set(s.node_id, s);
  const myNodes = (input.strategicNodes || []).filter((n: any) => n.controlled_by === f);
  const isolated = myNodes.filter((n: any) => supMap.get(n.id)?.connected_to_capital === false);
  if (isolated.length) problems.push(`${isolated.length} izolovaných uzlů: ${isolated.slice(0, 3).map((n: any) => n.name).join(", ")}`);
  const lowStab = (input.cities || []).filter((c: any) => (c.city_stability || 70) < 50);
  if (lowStab.length) problems.push(`${lowStab.length} měst s nízkou stabilitou: ${lowStab.slice(0, 3).map((c: any) => `${c.name}(${c.city_stability})`).join(", ")}`);
  if (input.milMetrics?.warState === "war" && input.milMetrics?.warReadiness < 70) {
    problems.push(`Válka, připravenost ${input.milMetrics.warReadiness}/100`);
  }
  if (input.resources.grain < 30) problems.push(`Nízké zásoby obilí: ${input.resources.grain}`);

  const opportunities: string[] = [];
  const uncontr = (input.strategicNodes || []).filter((n: any) => !n.controlled_by && n.is_major && (n.economic_value >= 5 || n.strategic_value >= 5));
  if (uncontr.length) opportunities.push(`${uncontr.length} volných major uzlů (top: ${uncontr.slice(0, 3).map((n: any) => n.name).join(", ")})`);
  const peacefulRich = factions.filter((x) => x.tension < 20 && x.tradeRoutes === 0);
  if (peacefulRich.length) opportunities.push(`Obchodní příležitost s: ${peacefulRich.slice(0, 3).map((x) => x.name).join(", ")}`);
  if (input.peaceOffers?.length) opportunities.push(`${input.peaceOffers.length} nabídek míru`);

  const threats: string[] = [];
  if (input.milMetrics?.warState === "war") threats.push(`VÁLKA: vidí ${input.milMetrics.enemyVisiblePower} síly nepřítele`);
  const crises = (input.allTensionData || []).filter((t: any) => t.crisis_triggered &&
    (t.player_a === f || t.player_b === f));
  if (crises.length) threats.push(`${crises.length} krizí s: ${crises.slice(0, 3).map((t: any) => t.player_a === f ? t.player_b : t.player_a).join(", ")}`);
  const nearEnemyStacks = (input.enemyStacks || []).slice(0, 3);
  if (nearEnemyStacks.length && input.milMetrics?.warState !== "peace") {
    threats.push(`Nepřátelské stacky: ${nearEnemyStacks.map((s: any) => `${s.player_name}(síla ${s.power})`).join(", ")}`);
  }
  if (input.milMetrics?.vulnerableCities?.length) {
    threats.push(`Zranitelná města: ${input.milMetrics.vulnerableCities.slice(0, 3).map((c: any) => c.name).join(", ")}`);
  }

  const pastActs = (input.myPastActions || []).slice(0, 3).map((a: any) => `T${a.turn_number} ${a.action_type}: ${(a.description || "").substring(0, 80)}`);
  const dipMems = (input.diplomMemories || []).slice(0, 2).map((m: any) => {
    const other = m.faction_a === f ? m.faction_b : m.faction_a;
    return `T${m.turn_number} ${m.memory_type} s ${other}: ${(m.detail || "").substring(0, 80)}`;
  });
  const memory = [...pastActs, ...dipMems].slice(0, 5);

  return {
    identity: {
      name: f,
      personality: input.faction?.personality || "diplomatic",
      myth: input.civ?.core_myth || "",
      goals: input.faction?.goals || [],
      disposition: disp,
    },
    resources: {
      gold: input.resources.gold,
      grain: input.resources.grain,
      faith: input.resources.faith,
      manpower: input.resources.manpower,
      manpowerCommitted: input.resources.manpowerCommitted,
      production: Number(input.realmRes?.total_production ?? input.resources.production ?? 0),
      wealth: Number(input.realmRes?.total_wealth ?? 0),
      capacity: Number(input.realmRes?.total_capacity ?? 0),
      legitimacy: input.realmRes?.legitimacy,
    },
    military: {
      state: input.milMetrics?.warState || "peace",
      readiness: input.milMetrics?.warReadiness || 0,
      ownPower: input.milMetrics?.totalArmyPower || 0,
      deployedPower: input.milMetrics?.deployedArmyPower || 0,
      enemyVisiblePower: input.milMetrics?.enemyVisiblePower || 0,
      mobilization: {
        current: input.milMetrics?.currentMobilizationRate || 0,
        suggested: input.milMetrics?.suggestedMobilizationRate || 0,
        maxSafe: input.milMetrics?.maxSafeMobilization || 0,
      },
      undeployedCount: input.milMetrics?.undeployedStacks?.length || 0,
      deployedCount: input.milMetrics?.deployedStacks?.length || 0,
    },
    diplomacy: {
      factions,
      activeWars: (input.activeWars || []).map((w: any) => ({
        with: w.declaring_player === f ? w.target_player : w.declaring_player,
        since: w.declared_turn,
      })),
      pendingPeace: (input.peaceOffers || []).map((w: any) => ({ from: w.peace_offered_by, terms: w.peace_conditions })),
      ultimatumsSentTo: (input.sentUltimatums || []).map((m: any) => m.message_text?.match(/\[ULTIMÁTUM\]\s*(\S+)/)?.[1] || "?").slice(0, 3),
      recentMessages: (input.recentMessages || []).slice(0, 3).map((m: any) => ({
        from: m.sender,
        text: (m.message_text || "").substring(0, 120),
      })),
    },
    problems: problems.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
    threats: threats.slice(0, 3),
    memory,
  };
}
