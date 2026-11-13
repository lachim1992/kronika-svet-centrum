import { producerLimit } from "./economyFieldContract";

export type ParcelRow = { id: string; city_id: string | null; owner_player: string | null; status: string; land_use?: string | null; buildable?: boolean; grid_x?: number; grid_y?: number };
export type ParcelActual = { producer: string; recipe: string; good: string; realized: number; potential: number; employed: number; jobs: number | null; reservoir: number | null; reason: string | null };

/** Stable producer id is `parcel:{uuid}:{recipe}` (parcelEconomy.parcelProducers). */
export function parcelIdOf(producer: string): { parcel: string; recipe: string } | null {
  const m = /^parcel:([0-9a-f-]{36}):(.+)$/i.exec(producer || "");
  return m ? { parcel: m[1], recipe: m[2] } : null;
}

/** Index committed producer diagnostics by parcel id — one pass, no per-parcel queries. */
export function indexParcelProducers(producers: any[] | undefined | null): Map<string, ParcelActual[]> {
  const out = new Map<string, ParcelActual[]>();
  for (const p of producers || []) {
    const id = parcelIdOf(String(p?.producer ?? "")); if (!id) continue;
    const row: ParcelActual = {
      producer: p.producer, recipe: id.recipe, good: String(p.good ?? ""), realized: Number(p.realized) || 0,
      potential: Number(p.potential ?? p.capacity ?? 0) || 0, employed: Number(p.employed) || 0,
      jobs: p.jobs_capacity ?? null, reservoir: p.parcel?.reservoir ?? null, reason: producerLimit(p),
    };
    const list = out.get(id.parcel) || []; list.push(row); out.set(id.parcel, list);
  }
  return out;
}

/** Live operation for a structure. Rural sites run as their parcel producer, not under the building id. */
export function buildingOperationLines(producers: any[] | undefined | null, target: { id: string; parcelId?: string | null; recipeKeys?: string[] }): any[] {
  const recipes = new Set((target.recipeKeys || []).map(String));
  return (producers || []).filter(p => {
    const producer = String(p?.producer || "");
    if (producer.startsWith(`${target.id}:`)) return true;
    if (!target.parcelId) return false;
    const id = parcelIdOf(producer);
    return id?.parcel === target.parcelId && recipes.has(id.recipe);
  });
}

/** Why a parcel yields nothing autonomously, or null if the ledger is the answer. */
export function parcelZeroReason(p: ParcelRow, actual: ParcelActual[] | undefined, hasReport: boolean): string | null {
  if (!p.city_id || !p.owner_player || p.status === "wild") return "nevlastněný dílek — nic neprodukuje";
  if (p.status === "blocked") return "zablokovaný dílek";
  if (p.status === "occupied" || (p.land_use && !["open", "wild", "natural"].includes(p.land_use))) return "zastavěno — přírodní sběr se tu nekoná";
  if (!hasReport) return "chybí uzavřený tah — skutečný výnos zatím neznámý";
  if (!actual?.length) return "žádný provoz na tomto dílku v posledním tahu";
  if (actual.every(a => a.realized <= 0)) return actual.find(a => a.reason)?.reason || (actual.some(a => a.employed <= 0) ? "nikdo zde nepracuje" : "zdroj vyčerpán");
  return null;
}

/** Macro-square summary: realized output only from city-owned parcels, potential of unclaimed separately. */
export function macroSummary(parcels: ParcelRow[], index: Map<string, ParcelActual[]>, unclaimedPotential: (p: ParcelRow) => number) {
  let ownedRealized = 0, ownedCount = 0, unclaimed = 0, unclaimedCount = 0;
  for (const p of parcels) {
    if (p.city_id && p.owner_player) { ownedCount++; for (const a of index.get(p.id) || []) ownedRealized += a.realized; }
    else { unclaimedCount++; unclaimed += unclaimedPotential(p); }
  }
  return { ownedRealized, ownedCount, unclaimedPotential: unclaimed, unclaimedCount };
}
