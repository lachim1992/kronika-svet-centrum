import type { Scenario, ScenarioBiome } from "@/lib/scenarioSandbox";
import { SCENARIO_BIOMES } from "@/lib/scenarioSandbox";
export { computeStackPower } from "../../supabase/functions/_shared/unitTypes";

/** Live-world biome_family → editor biome (display only). */
export const DB_TO_EDITOR: Record<string, ScenarioBiome> = {
  sea: "water", water: "water", plains: "plains", forest: "forest", hills: "hills",
  mountain: "mountain", mountains: "mountain", tundra: "mountain", desert: "desert", swamp: "swamp",
};
/** Editor biome → stored biome_family. */
export const EDITOR_TO_DB: Record<ScenarioBiome, string> = {
  water: "sea", plains: "plains", forest: "forest", hills: "hills", mountain: "mountain", desert: "desert", swamp: "swamp",
};

export type LiveHex = { grid_x: number | null; grid_y: number | null; biome_family: string | null };
export type LiveCity = { id: string; name: string; owner_player: string; population_total: number | null; grid_x: number | null; grid_y: number | null };
export type LiveStack = { id: string; name: string; player_name: string; morale: number | null; battle_formation: string | null; grid_x: number | null; grid_y: number | null };
export type LiveComp = { id: string; stack_id: string; unit_type: string | null; manpower: number | null };

/** Projects a live world into the editor's view model; `origin` converts view ↔ world grid. */
export function liveToScenario(name: string, hexes: LiveHex[], cities: LiveCity[], stacks: LiveStack[], comps: LiveComp[]) {
  const cells = hexes.filter(h => h.grid_x != null && h.grid_y != null) as Array<LiveHex & { grid_x: number; grid_y: number }>;
  const minX = Math.min(...cells.map(h => h.grid_x)), minY = Math.min(...cells.map(h => h.grid_y));
  const maxX = Math.max(...cells.map(h => h.grid_x)), maxY = Math.max(...cells.map(h => h.grid_y));
  const origin = { x: minX, y: minY };
  const scenario: Scenario = {
    version: 1, name, seed: "LIVE", width: maxX - minX + 1, height: maxY - minY + 1,
    tiles: cells.map(h => { const biome = DB_TO_EDITOR[h.biome_family ?? ""] ?? "plains"; return { x: h.grid_x - minX, y: h.grid_y - minY, biome, micro: [...SCENARIO_BIOMES[biome].micro] }; }),
    cities: cities.filter(c => c.grid_x != null && c.grid_y != null).map(c => ({ id: c.id, name: c.name, owner: c.owner_player, population: c.population_total ?? 0, x: c.grid_x! - minX, y: c.grid_y! - minY })),
    armies: stacks.filter(s => s.grid_x != null && s.grid_y != null).map(s => ({
      id: s.id, name: s.name, owner: s.player_name, morale: s.morale ?? 70, formation: (s.battle_formation ?? "line") as never,
      x: s.grid_x! - minX, y: s.grid_y! - minY,
      composition: comps.filter(c => c.stack_id === s.id).map(c => ({ id: c.id, unit_type: (c.unit_type ?? "MILITIA") as never, manpower: c.manpower ?? 0 })),
    })),
    roads: [], resources: [], sites: [],
  };
  return { scenario, origin };
}

