// City footprint on the 36 sub-parcel grid (6 x 6 per map cell).
// This is the ONLY city land model: a city is the set of tile_parcels rows it holds.
// A city always has one seat parcel (status "occupied", land_use "civic") plus a ring of
// claimed parcels sized by its population; large cities spill onto cardinal neighbour cells.

import {
  generateTileParcels,
  POPULATION_PER_SLOT,
  TILE_PARCEL_COLS,
  TILE_PARCEL_COUNT,
  TILE_PARCEL_ROWS,
} from "./tileParcels.ts";

const PARCEL_SELECT =
  "id, grid_x, grid_y, parcel_index, parcel_x, parcel_y, status, buildable, capacity_slots, build_cost_multiplier, sub_biome, elevation, city_id, owner_player, land_use";

/** Materialize the deterministic 36 sub-parcels of a map cell (idempotent). */
export async function ensureTileParcels(
  supabase: any,
  sessionId: string,
  gridX: number,
  gridY: number,
): Promise<any[]> {
  const { data: existing } = await supabase.from("tile_parcels")
    .select(PARCEL_SELECT)
    .eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).order("parcel_index");
  if ((existing?.length || 0) >= TILE_PARCEL_COUNT) return existing || [];

  // The cell plus its four cardinal neighbours: the own biome dominates, neighbours only
  // bleed into the parcels along the shared border.
  const { data: patch } = await supabase.from("province_hexes")
    .select("grid_x, grid_y, biome_family, elevation, has_river, is_coastal, is_passable")
    .eq("session_id", sessionId)
    .gte("grid_x", gridX - 1).lte("grid_x", gridX + 1)
    .gte("grid_y", gridY - 1).lte("grid_y", gridY + 1);
  const patchRows = patch || [];
  const tile = patchRows.find((row: any) => row.grid_x === gridX && row.grid_y === gridY);
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => {
      const terrain = patchRows.find((row: any) => row.grid_x === gridX + dx && row.grid_y === gridY + dy);
      return terrain ? { dx, dy, terrain } : null;
    })
    .filter(Boolean) as Array<{ dx: number; dy: number; terrain: any }>;

  const seen = new Set((existing || []).map((row: any) => row.parcel_index));
  const rows = generateTileParcels(sessionId, gridX, gridY, tile ?? {}, neighbours)
    .filter((spec) => !seen.has(spec.parcelIndex))
    .map((spec) => ({
      session_id: sessionId, grid_x: gridX, grid_y: gridY,
      parcel_index: spec.parcelIndex, parcel_x: spec.parcelX, parcel_y: spec.parcelY,
      sub_biome: spec.subBiome, elevation: spec.elevation, buildable: spec.buildable,
      build_cost_multiplier: spec.buildCostMultiplier, capacity_slots: spec.capacitySlots,
      status: spec.buildable ? "wild" : "blocked",
    }));
  if (rows.length) {
    await supabase.from("tile_parcels").upsert(rows, { onConflict: "session_id,grid_x,grid_y,parcel_index" });
  }
  const { data: refreshed } = await supabase.from("tile_parcels")
    .select(PARCEL_SELECT)
    .eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).order("parcel_index");
  return refreshed || [];
}

/** Housing capacity backed by the sub-parcels a city actually holds. */
export async function cityParcelCapacity(supabase: any, sessionId: string, cityId: string) {
  const { data } = await supabase.from("tile_parcels")
    .select("capacity_slots, status, grid_x, grid_y")
    .eq("session_id", sessionId).eq("city_id", cityId)
    .in("status", ["claimed", "occupied"]);
  const rows = data || [];
  const slots = rows.reduce((sum: number, row: any) => sum + (row.capacity_slots || 0), 0);
  const cells = new Set(rows.map((row: any) => `${row.grid_x},${row.grid_y}`));
  return { slots, capacity: slots * POPULATION_PER_SLOT, claimed: rows.length, cells: [...cells] };
}

/** How many sub-parcels a settlement of this size should hold. */
export function targetParcelCount(population: number): number {
  const wanted = Math.ceil(Math.max(0, population) / (POPULATION_PER_SLOT * 2));
  return Math.max(4, Math.min(28, wanted));
}

function ringDistance(a: number, b: number) {
  const ax = a % TILE_PARCEL_COLS, ay = Math.floor(a / TILE_PARCEL_COLS);
  const bx = b % TILE_PARCEL_COLS, by = Math.floor(b / TILE_PARCEL_COLS);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function quality(row: any) {
  return (row.capacity_slots || 0) * 2 - Number(row.build_cost_multiplier || 1);
}

/** Best defensible / workable seat: high capacity, cheap ground, near the middle of the cell. */
function pickSeat(parcels: any[], preferredIndex: number | null) {
  const buildable = parcels.filter((row: any) => row.buildable && (!row.city_id || row.status !== "occupied"));
  if (!buildable.length) return null;
  if (preferredIndex !== null) {
    const wanted = buildable.find((row: any) => row.parcel_index === preferredIndex);
    if (wanted) return wanted;
  }
  const centerIndex = Math.floor(TILE_PARCEL_ROWS / 2) * TILE_PARCEL_COLS + Math.floor(TILE_PARCEL_COLS / 2);
  return [...buildable].sort((a, b) =>
    quality(b) - quality(a)
    || ringDistance(a.parcel_index, centerIndex) - ringDistance(b.parcel_index, centerIndex)
    || a.parcel_index - b.parcel_index)[0];
}

/**
 * Give a city its physical footprint: one seat parcel plus claimed parcels around it sized
 * by population. Idempotent — an existing seat is kept and only the missing parcels are added.
 */
export async function seatCityOnParcels(
  supabase: any,
  options: {
    sessionId: string; cityId: string; cityName?: string; ownerPlayer: string;
    gridX: number; gridY: number; population: number; turnNumber: number;
    preferredIndex?: number | null;
  },
): Promise<{ seatIndex: number | null; claimed: number; cells: string[] }> {
  const { sessionId, cityId, ownerPlayer, gridX, gridY, population, turnNumber } = options;
  const homeParcels = await ensureTileParcels(supabase, sessionId, gridX, gridY);

  let seat = homeParcels.find((row: any) => row.city_id === cityId && row.status === "occupied");
  if (!seat) {
    seat = pickSeat(homeParcels, options.preferredIndex ?? null);
    if (!seat) return { seatIndex: null, claimed: 0, cells: [] };
    await supabase.from("tile_parcels").update({
      status: "occupied", land_use: "civic", city_id: cityId,
      owner_player: ownerPlayer, claimed_turn: turnNumber,
    }).eq("id", seat.id);
  }

  const target = targetParcelCount(population);
  const held = await cityParcelCapacity(supabase, sessionId, cityId);
  let missing = target - held.claimed;
  const claimedIds: string[] = [];
  const cells = new Set<string>(held.cells.length ? held.cells : [`${gridX},${gridY}`]);

  if (missing > 0) {
    const free = homeParcels
      .filter((row: any) => row.buildable && row.status === "wild" && !row.city_id && row.id !== seat.id)
      .sort((a: any, b: any) =>
        ringDistance(a.parcel_index, seat.parcel_index) - ringDistance(b.parcel_index, seat.parcel_index)
        || quality(b) - quality(a));
    const take = free.slice(0, missing);
    if (take.length) {
      await supabase.from("tile_parcels").update({
        status: "claimed", city_id: cityId, owner_player: ownerPlayer, claimed_turn: turnNumber,
      }).in("id", take.map((row: any) => row.id));
      claimedIds.push(...take.map((row: any) => row.id));
      missing -= take.length;
    }
  }

  // Spill onto cardinal neighbour cells for large settlements.
  if (missing > 0) {
    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of neighbours) {
      if (missing <= 0) break;
      const nx = gridX + dx, ny = gridY + dy;
      const { data: tile } = await supabase.from("province_hexes")
        .select("id, is_passable, biome_family, owner_player")
        .eq("session_id", sessionId).eq("grid_x", nx).eq("grid_y", ny).maybeSingle();
      if (!tile || tile.is_passable === false || tile.biome_family === "sea") continue;
      if (tile.owner_player && tile.owner_player !== ownerPlayer) continue;
      const parcels = await ensureTileParcels(supabase, sessionId, nx, ny);
      const free = parcels
        .filter((row: any) => row.buildable && row.status === "wild" && !row.city_id)
        .sort((a: any, b: any) => quality(b) - quality(a) || a.parcel_index - b.parcel_index)
        .slice(0, missing);
      if (!free.length) continue;
      await supabase.from("tile_parcels").update({
        status: "claimed", city_id: cityId, owner_player: ownerPlayer, claimed_turn: turnNumber,
      }).in("id", free.map((row: any) => row.id));
      claimedIds.push(...free.map((row: any) => row.id));
      cells.add(`${nx},${ny}`);
      missing -= free.length;
    }
  }

  return { seatIndex: seat.parcel_index, claimed: claimedIds.length, cells: [...cells] };
}
