import { ECONOMY as C } from './economyConfig.ts';

/**
 * SHARED LANDED-ROUTE ESTIMATE. One pure, deterministic shortest-path model used by both the
 * physical solver (goodsEconomy actual sourcing) and AUTO planning (economyAdapter expected
 * input cost), so supplier ordering can never contradict under an identical static snapshot.
 * Good-specific: bulk, perishability, water efficiency, transshipment; plus risk, toll, border.
 * Zero-capacity edges do not exist in the graph; an absent path means "unavailable", never free.
 */
export interface RouteEdge { id: string; from: string; to: string; cost: number; capacity: number;
  mode?: string; risk?: number; toll?: number; border?: number }
export interface RouteGood { bulk: number; perishability: number; transshipment: number }
export interface RoutePath<E extends RouteEdge = RouteEdge> { cells: string[]; edges: E[]; cost: number;
  capacity: number; loss: number; tolls: number; risk: number }

const n = (x: unknown) => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export const routeFrictionClass = (g: RouteGood) => `${g.bulk}:${g.perishability}:${g.transshipment}`;

export function edgeTransportCost(e: RouteEdge, g: RouteGood) {
  return n(e.cost) * Math.max(0.01, g.bulk) * (e.mode === 'river' || e.mode === 'sea' ? C.waterBulkEfficiency : 1) * C.transportUnitCost +
    n(e.risk) + n(e.toll) + n(e.border) + g.perishability * n(e.cost) + g.transshipment * C.transshipmentCost;
}

export function buildRouteGraph<E extends RouteEdge>(edges: E[]) {
  const graph = new Map<string, E[]>();
  for (const e of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!(e.capacity > 0)) continue;
    graph.set(e.from, [...(graph.get(e.from) || []), e]);
    graph.set(e.to, [...(graph.get(e.to) || []), { ...e, from: e.to, to: e.from }]);
  }
  return graph;
}

export function shortestTree<E extends RouteEdge>(graph: Map<string, E[]>, from: string, g: RouteGood) {
  const dist = new Map([[from, 0]]), prev = new Map<string, E>(), open = new Set([from]);
  while (open.size) {
    const u = [...open].sort((a, b) => dist.get(a)! - dist.get(b)! || a.localeCompare(b))[0]; open.delete(u);
    for (const e of graph.get(u) || []) { const d = dist.get(u)! + edgeTransportCost(e, g);
      if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, e); open.add(e.to); } }
  }
  return { dist, prev };
}

export function tracePath<E extends RouteEdge>(tree: { dist: Map<string, number>; prev: Map<string, E> }, from: string, to: string, g: RouteGood): RoutePath<E> | null {
  if (!tree.dist.has(to)) return null;
  let u = to; const edges: E[] = [], cells = [to];
  while (u !== from) { const e = tree.prev.get(u); if (!e) return null; edges.unshift(e); u = e.from; cells.unshift(u); }
  return { cells, edges, cost: tree.dist.get(to)!, capacity: Math.min(...edges.map(e => e.capacity / Math.max(1, g.bulk)), Infinity),
    loss: clamp(edges.reduce((a, e) => a + n(e.cost) * g.perishability, 0)), tolls: edges.reduce((a, e) => a + n(e.toll), 0),
    risk: edges.reduce((a, e) => a + n(e.risk), 0) };
}

/** True when a path can physically carry goods at all (same rule as goodsEconomy.landed()). */
export const usablePath = (p: RoutePath | null): p is RoutePath => !!p && p.loss < 1 && p.capacity > 0;
