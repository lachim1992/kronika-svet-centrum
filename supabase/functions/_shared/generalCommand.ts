/** Canonical general command conversions. General skill is always stored on a 0–100 scale. */
export const NO_GENERAL_CP = 4;
export const NO_GENERAL_ARMY_CAPACITY = 2_000;
export const MAX_GENERAL_CP = 7;
export const MAX_GENERAL_ARMY_CAPACITY = 12_000;

export function clampGeneralSkill(skill: number | null | undefined): number {
  const value = Number(skill);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export const GENERAL_CP_RULE_TEXT = "Velitelské body: bez generála nebo schopnost 0–39 = 4 CP; 40–55 = 5 CP; 56–62 = 6 CP; 63–100 = 7 CP.";

/** 4 CP without a general; skill 0–39 => 4, 40–55 => 5, 56–62 => 6, 63–100 => 7. */
export function generalCommandPoints(skill: number | null | undefined): number {
  if (skill == null) return NO_GENERAL_CP;
  const value = clampGeneralSkill(skill);
  if (value >= 63) return MAX_GENERAL_CP;
  if (value >= 56) return 6;
  if (value >= 40) return 5;
  return NO_GENERAL_CP;
}

/** Per-stack capacity, never a realm-wide mobilization limit. */
export function generalArmyCapacity(skill: number | null | undefined): number {
  if (skill == null) return NO_GENERAL_ARMY_CAPACITY;
  return Math.min(MAX_GENERAL_ARMY_CAPACITY, NO_GENERAL_ARMY_CAPACITY + Math.round(clampGeneralSkill(skill) * 100));
}

/** Fraction of morale damage prevented: 0–0.25. It never increases damage or power. */
export function generalMoraleLossReduction(skill: number | null | undefined): number {
  return skill == null ? 0 : clampGeneralSkill(skill) * 0.0025;
}

/** Valid Rally restores 15–20 morale. Existing three-round cooldown is unchanged. */
export function generalRallyStrength(skill: number | null | undefined): number {
  return 15 + Math.floor(clampGeneralSkill(skill) / 20);
}
