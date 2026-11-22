/**
 * Neutral-city village planner (pure, deterministic, no I/O, no AI calls).
 * Decides at most ONE village action per call from server-read state; execution goes through the
 * same CREATE_RURAL_SETTLEMENT / UPGRADE_RURAL_SETTLEMENT commands (and SQL RPCs) as a player,
 * so price, reach, ownership and idempotency are enforced in one place. Nothing is minted.
 *
 * Need = a village would actually change the canonical economy: an owned worked parcel on a
 * FOOTPATH cell (Chebyshev distance 1 from the seat, no completed own road on that edge), where the
 * village freight bonus applies. Cells with a road (already 100 %) or no connection (stays 0) are skipped.
 */
import { parcelTransport, type RoadEdge } from './ruralSites.ts';
import { RURAL_SETTLEMENT_COST, RURAL_SETTLEMENT_MAX_LEVEL, RURAL_SETTLEMENT_REACH, RURAL_SETTLEMENT_UPGRADE_COST, macroDistance, sanitizeVillageName } from './ruralSettlement.ts';

export const NEUTRAL_VILLAGE_GOLD_BUFFER = 40;
export interface NvCity { id: string; name: string; owner_player: string; status: string | null; grid_x: number | null; grid_y: number | null }
export interface NvParcel { id: string; grid_x: number; grid_y: number; parcel_index: number; city_id: string | null; owner_player: string | null; claim_kind: string | null }
export interface NvVillage { id: string; city_id: string; owner_player: string; grid_x: number; grid_y: number; level: number; founded_turn?: number | null }
export interface NvRoad { from_x: number; from_y: number; to_x: number; to_y: number; status: string; owner_player?: string | null }
export type NvAction =
  | { kind: 'create'; parcelId: string; name: string; commandId: string; cost: number; cell: string }
  | { kind: 'upgrade'; settlementId: string; targetLevel: number; commandId: string; cost: number; cell: string };

/** Deterministic UUID-shaped id (FNV-1a), stable across retries of the same turn/city/action. */
export function deterministicCommandId(seed: string): string {
  let h = '';
  for (let k = 0; k < 4; k++) {
    let x = 0x811c9dc5 ^ k;
    for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    h += x.toString(16).padStart(8, '0');
  }
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Footpath cell exactly as the canonical solver sees it (ruralSites.parcelTransport): only
 * COMPLETED roads of the city's own realm (or unowned legacy roads) count, multi-hop road
 * paths count, and a foreign road never upgrades a footpath. A village only helps 'footpath'.
 */
export function isFootpathCell(city: NvCity, x: number, y: number, roads: NvRoad[]): boolean {
  if (city.grid_x == null || city.grid_y == null) return false;
  const edges: RoadEdge[] = roads.filter(r => r.status === 'completed')
    .map(r => ({ from: `${r.from_x},${r.from_y}`, to: `${r.to_x},${r.to_y}`, owner: r.owner_player ?? null }));
  return parcelTransport(`${x},${y}`, `${city.grid_x},${city.grid_y}`, edges, city.owner_player).mode === 'footpath';
}

/** Turns a neutral village waits after founding/upgrade before the next upgrade (no level-per-turn spree). */
export const NEUTRAL_VILLAGE_UPGRADE_COOLDOWN = 3;

export function planNeutralVillage(a: { sessionId: string; closedTurn: number; city: NvCity; gold: number; parcels: NvParcel[]; villages: NvVillage[]; roads: NvRoad[];
  /** Latest turn_number of rural_settlement_upgrades per settlement id (server read). */
  lastUpgradeTurn?: Record<string, number> }): NvAction | null {
  const { city } = a;
  if (!city.owner_player.startsWith('Neutral:') || city.status !== 'ok' || city.grid_x == null || city.grid_y == null) return null;
  const own = a.villages.filter(v => v.city_id === city.id && v.owner_player === city.owner_player)
    .filter(v => isFootpathCell(city, v.grid_x, v.grid_y, a.roads))
    .sort((x, y) => x.level - y.level || x.id.localeCompare(y.id));
  const lastAction = (v: NvVillage) => Math.max(Number(v.founded_turn ?? 0) || 0, Number(a.lastUpgradeTurn?.[v.id] ?? 0) || 0);
  const up = own.find(v => v.level < RURAL_SETTLEMENT_MAX_LEVEL);
  // One village per city: while its upgrade is cooling down the city does nothing (no second village).
  if (up && a.closedTurn + 1 - lastAction(up) < NEUTRAL_VILLAGE_UPGRADE_COOLDOWN) return null;
  if (up) {
    const target = up.level + 1, cost = RURAL_SETTLEMENT_UPGRADE_COST[target];
    if (a.gold < cost + NEUTRAL_VILLAGE_GOLD_BUFFER) return null;
    return { kind: 'upgrade', settlementId: up.id, targetLevel: target, cost, cell: `${up.grid_x},${up.grid_y}`,
      commandId: deterministicCommandId(`nv-up|${a.sessionId}|${a.closedTurn}|${up.id}|${target}`) };
  }
  if (a.villages.some(v => v.city_id === city.id)) return null; // upgrade path only; never a village spree
  if (a.gold < RURAL_SETTLEMENT_COST + NEUTRAL_VILLAGE_GOLD_BUFFER) return null;
  const occupied = new Set(a.villages.map(v => `${v.grid_x},${v.grid_y}`));
  const site = a.parcels
    .filter(p => p.city_id === city.id && p.owner_player === city.owner_player && p.claim_kind === 'worked')
    .filter(p => macroDistance(p.grid_x, p.grid_y, city.grid_x!, city.grid_y!) <= RURAL_SETTLEMENT_REACH)
    .filter(p => !occupied.has(`${p.grid_x},${p.grid_y}`) && isFootpathCell(city, p.grid_x, p.grid_y, a.roads))
    .sort((x, y) => x.grid_x - y.grid_x || x.grid_y - y.grid_y || x.parcel_index - y.parcel_index)[0];
  if (!site) return null;
  const name = sanitizeVillageName(`${city.name} – ves`) ?? 'Ves';
  return { kind: 'create', parcelId: site.id, name, cost: RURAL_SETTLEMENT_COST, cell: `${site.grid_x},${site.grid_y}`,
    commandId: deterministicCommandId(`nv-create|${a.sessionId}|${a.closedTurn}|${city.id}|${site.id}`) };
}
