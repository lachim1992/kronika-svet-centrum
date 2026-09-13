export const TILE_INFRASTRUCTURE_LEVELS = [
  { level: 1, key: "trail", label: "Stezka", gold: 30, production: 20, turns: 1 },
  { level: 2, key: "road", label: "Cesta", gold: 65, production: 45, turns: 2 },
  { level: 3, key: "paved", label: "Dlážděná cesta", gold: 120, production: 80, turns: 3 },
] as const;
export const tileInfrastructureLevel = (level: number) => TILE_INFRASTRUCTURE_LEVELS.find(item => item.level === level);
