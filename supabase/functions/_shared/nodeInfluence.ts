// Patch 6 + 12 — shared influence math (engine-only).
// AI never decides these values.

export interface InfluenceState {
  economic_influence: number;
  political_influence: number;
  military_pressure: number;
  resistance: number;
  integration_progress: number;
}

export interface AnnexCheckInput {
  influence: InfluenceState;
  autonomy_score: number; // from province_nodes.autonomy_score
}

export interface AnnexCheckResult {
  integrationPressure: number;
  threshold: number;
  allowed: boolean;
  missing: number; // > 0 → how much pressure is still needed
}

/**
 * integrationPressure = econ*0.45 + pol*0.35 + mil*0.20
 * annexAllowed = integrationPressure >= resistance + autonomy*0.5
 */
export function computeAnnexCheck({ influence, autonomy_score }: AnnexCheckInput): AnnexCheckResult {
  const integrationPressure =
    influence.economic_influence * 0.45 +
    influence.political_influence * 0.35 +
    influence.military_pressure * 0.20;

  const threshold = influence.resistance + autonomy_score * 0.5;
  const allowed = integrationPressure >= threshold;
  return {
    integrationPressure,
    threshold,
    allowed,
    missing: allowed ? 0 : Math.max(0, threshold - integrationPressure),
  };
}

export const DEFAULT_INFLUENCE: InfluenceState = {
  economic_influence: 0,
  political_influence: 0,
  military_pressure: 0,
  resistance: 50,
  integration_progress: 0,
};

// ─────────────────────────────────────────────────────────────────
// Patch 12 — Multiplayer contestation
// ─────────────────────────────────────────────────────────────────

export interface RivalRow {
  player_name: string;
  influence: InfluenceState;
  pressure: number; // computed integrationPressure
}

export function computePressure(i: InfluenceState): number {
  return i.economic_influence * 0.45 + i.political_influence * 0.35 + i.military_pressure * 0.20;
}

/**
 * Trade-race scaling: každý další konkurent v trade_open+ statusu sníží
 * získaný economic_influence faktorem (1 / (1 + 0.4 * rivals)).
 *  - 0 rivals → +5 (full)
 *  - 1 rival  → +5 / 1.4 ≈ +3.57
 *  - 2 rivals → +5 / 1.8 ≈ +2.78
 */
export function scaleByCompetition(base: number, rivalCount: number): number {
  if (rivalCount <= 0) return base;
  return base / (1 + 0.4 * rivalCount);
}

/**
 * Rivalry decay: získání vlivu jednoho hráče snižuje vliv ostatních o malý
 * podíl (eroze přízně). Vrací patch dictionary { economic_influence?, political_influence?, military_pressure? }.
 *
 * Defaults: rival ztratí ~15 % toho, co aktér získal, na stejné kategorii.
 * Resistance se nemění (to je vlastnost uzlu, ne hráč-vs-hráč).
 */
export function applyRivalryErosion(
  rival: InfluenceState,
  channel: "economic_influence" | "political_influence" | "military_pressure",
  actorGain: number,
  factor = 0.15,
): Partial<InfluenceState> {
  const erosion = actorGain * factor;
  const next = Math.max(0, rival[channel] - erosion);
  return { [channel]: next } as Partial<InfluenceState>;
}

export interface ContestationCheckInput {
  actorPressure: number;
  rivals: RivalRow[];
  /** ratio (0..1) of actor's pressure that any rival must reach to flag as contested */
  contestThreshold?: number;
}

export interface ContestationCheckResult {
  contested: boolean;
  topRivalPressure: number;
  topRivalName: string | null;
  /** count of rivals at or above threshold */
  contestants: number;
}

/**
 * Annex contestation: pokud má jiný hráč ≥ 60 % aktérova tlaku, anexe je
 * blokována — uzel je „kontestovaný".
 */
export function computeContestation({
  actorPressure,
  rivals,
  contestThreshold = 0.6,
}: ContestationCheckInput): ContestationCheckResult {
  let topPressure = 0;
  let topName: string | null = null;
  let contestants = 0;
  const limit = actorPressure * contestThreshold;
  for (const r of rivals) {
    if (r.pressure > topPressure) {
      topPressure = r.pressure;
      topName = r.player_name;
    }
    if (r.pressure >= limit && actorPressure > 0) contestants++;
  }
  return {
    contested: contestants > 0,
    topRivalPressure: topPressure,
    topRivalName: topName,
    contestants,
  };
}
