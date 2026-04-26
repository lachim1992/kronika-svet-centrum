// Patch 6 — shared influence math.
// Engine-only. AI never decides these values.

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
