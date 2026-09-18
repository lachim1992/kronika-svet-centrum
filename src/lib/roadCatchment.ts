// Client mirror of supabase/functions/_shared/roadCatchment.ts — how far from a
// settlement or node a finished road still attaches it to the transport system.

export const MAX_CATCHMENT_RADIUS = 4;

export function nodeCatchmentRadius(node: {
  node_tier?: string | null; upgrade_level?: number | null; infrastructure_level?: number | null;
}): number {
  const tier = String(node?.node_tier ?? "").toLowerCase();
  let base = 1;
  if (tier.includes("capital") || tier.includes("major")) base = 3;
  else if (tier.includes("minor")) base = 2;

  const upgrade = Math.max(0, Number(node?.upgrade_level ?? 1) - 1);
  if (upgrade >= 2) base += 1;
  if (Number(node?.infrastructure_level ?? 0) >= 2) base += 1;

  return Math.min(MAX_CATCHMENT_RADIUS, base);
}

export function cityCatchmentRadius(city: { settlement_level?: string | number | null; development_level?: number | null }): number {
  const level = Number(city?.development_level ?? city?.settlement_level ?? 1);
  let base = 2;
  if (level >= 4) base = 3;
  if (level >= 6) base = 4;
  return Math.min(MAX_CATCHMENT_RADIUS, base);
}

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
