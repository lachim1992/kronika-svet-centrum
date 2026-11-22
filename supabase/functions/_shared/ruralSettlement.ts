// Persisted rural settlements (villages) — STAGE 2.
//
// A village is an ANCHOR entity on one owned, worked hinterland parcel of a city. It owns no
// population: the people are the macro cell's existing rural pool (hex_population → producer
// .ruralLabor, allocated once per cell by goodsEconomy). Its producers are the rural sites on
// worked parcels in the same macro cell — linked deterministically by cell, never by a second
// staffing pass. Founding charges gold_reserve once inside the `create_rural_settlement` RPC
// (idempotent by command_id); nothing is minted. One village per macro cell (DB unique).
// No tax or income is attached yet: collection must go through the existing financial accounts.

export const RURAL_SETTLEMENT_COST = 20;          // gold, server constant; client never sends a price
export const RURAL_SETTLEMENT_REACH = 2;          // max Chebyshev macro distance from the city's own square
export const RURAL_SETTLEMENT_NAME_MAX = 40;

export interface VillageParcel { id: string; session_id?: string; grid_x: number; grid_y: number; city_id: string | null; owner_player: string | null; claim_kind: string | null; building_id?: string | null }
export interface VillageCity { id: string; owner_player: string | null; grid_x: number | null; grid_y: number | null; status?: string | null }
export interface PersistedVillage { id: string; city_id: string; parcel_id: string; grid_x: number; grid_y: number; name: string; level: number; founded_turn: number; owner_player: string }

export function sanitizeVillageName(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, RURAL_SETTLEMENT_NAME_MAX);
  return s.length >= 2 ? s : null;
}

export const macroDistance = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Pure pre-check mirrored by the SQL RPC (the RPC is authoritative under lock). null = allowed. */
export function ruralSettlementReason(a: { player: string; parcel: VillageParcel | null; city: VillageCity | null; name: string | null; villageInCell: boolean; villageOnParcel: boolean }): string | null {
  if (!a.parcel) return 'Políčko neexistuje.';
  if (a.parcel.owner_player !== a.player) return 'Políčko ti nepatří.';
  if (a.parcel.claim_kind !== 'worked') return 'Vesnici lze založit jen na obdělávané venkovské parcele.';
  if (!a.city || a.city.id !== a.parcel.city_id) return 'Parcela nepatří k žádnému městu.';
  if (a.city.owner_player !== a.player) return 'Město ti nepatří.';
  if (a.city.grid_x == null || a.city.grid_y == null) return 'Poloha města není známa.';
  if (macroDistance(a.parcel.grid_x, a.parcel.grid_y, a.city.grid_x, a.city.grid_y) > RURAL_SETTLEMENT_REACH)
    return `Vesnice může být nejvýše ${RURAL_SETTLEMENT_REACH} pole od města.`;
  if (a.villageOnParcel || a.villageInCell) return 'V tomto poli už vesnice stojí.';
  if (!a.name) return 'Zadej název vesnice (2–40 znaků).';
  return null;
}
