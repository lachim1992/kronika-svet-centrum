// Loads the live micro units of one siege (shared by command-dispatch validation and commit-turn resolution).
import { microUnits, siegeInRange, type SiegeUnit } from "./siege.ts";

const pos = (s: any) => ({ x: s.grid_x ?? s.hex_q, y: s.grid_y ?? s.hex_r });

export async function loadSiegeUnits(supabase: any, siege: any, city: any): Promise<SiegeUnit[]> {
  const { data: stacks, error } = await supabase.from("military_stacks")
    .select("id, player_name, grid_x, grid_y, hex_q, hex_r, soldiers, is_active, is_deployed")
    .eq("session_id", siege.session_id).in("player_name", [siege.attacker_player, siege.defender_player]).eq("is_active", true);
  if (error) throw new Error(`Siege stacks unavailable: ${error.message}`);
  const ids = (stacks || []).map((s: any) => s.id);
  const { data: comp } = ids.length ? await supabase.from("military_stack_composition").select("stack_id, manpower, quality").in("stack_id", ids) : { data: [] };
  const quality = (id: string) => {
    const rows = (comp || []).filter((c: any) => c.stack_id === id); const men = rows.reduce((s: number, c: any) => s + Number(c.manpower || 0), 0);
    return men ? rows.reduce((s: number, c: any) => s + Number(c.quality || 50) * Number(c.manpower || 0), 0) / men : 50;
  };
  const c = { x: city.grid_x, y: city.grid_y };
  const out: SiegeUnit[] = [];
  for (const s of stacks || []) {
    const p = pos(s); if (typeof p.x !== "number") continue;
    if (s.player_name === siege.attacker_player && s.is_deployed && siegeInRange(p, c)) out.push(...microUnits("attacker", s.id, s.soldiers, quality(s.id)));
    if (s.player_name === siege.defender_player && p.x === c.x && p.y === c.y) out.push(...microUnits("defender", s.id, s.soldiers, quality(s.id)));
  }
  if (Number(city.military_garrison || 0) > 0) out.push(...microUnits("defender", null, Number(city.military_garrison), 45, "garrison"));
  return out;
}
