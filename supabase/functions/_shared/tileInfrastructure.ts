import { ROAD_TIERS } from "./roadNetwork.ts";

const CZECH_LABELS: Record<number, string> = { 1: "Stezka", 2: "Cesta", 3: "Dlážděná cesta" };

export const TILE_INFRASTRUCTURE_LEVELS = ROAD_TIERS.map(tier => ({
  level: tier.level,
  key: tier.key,
  label: CZECH_LABELS[tier.level] || tier.label,
  gold: tier.cost.gold,
  production: tier.cost.production,
  turns: tier.buildTurns,
  capacity: tier.capacity,
  speed: tier.speed,
  friction: tier.friction,
  maintenance: tier.maintenance,
}));
export const tileInfrastructureLevel = (level: number) => TILE_INFRASTRUCTURE_LEVELS.find(item => item.level === level);
