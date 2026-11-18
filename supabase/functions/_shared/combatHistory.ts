/** Normalize finished tactical field battles for chronicles, briefings and notifications. */
export const FIELD_BATTLE_HISTORY_COLS = "id, session_id, started_turn, finished_at, attacker_stack_id, defender_stack_id, attacker_player, defender_player, units, last_report";

export function fieldBattleHistory(row: any) {
  const report = row.last_report ?? {};
  const losses = report.losses ?? {};
  const men = (stackId: string) => (row.units ?? []).filter((u: any) => u.stackId === stackId)
    .reduce((sum: number, u: any) => sum + Number(u.startMen ?? u.men ?? 0), 0);
  return {
    id: row.id,
    session_id: row.session_id,
    turn_number: row.started_turn,
    created_at: row.finished_at,
    resolved_at: row.finished_at,
    attacker_stack_id: row.attacker_stack_id,
    defender_stack_id: row.defender_stack_id,
    defender_city_id: null,
    attacker_player: row.attacker_player,
    defender_player: row.defender_player,
    attacker_name: row.attacker_player,
    defender_name: row.defender_player,
    attacker_strength_snapshot: men(row.attacker_stack_id),
    defender_strength_snapshot: men(row.defender_stack_id),
    result: report.winner ?? "draw",
    casualties_attacker: Number(losses[row.attacker_stack_id]?.lost ?? 0),
    casualties_defender: Number(losses[row.defender_stack_id]?.lost ?? 0),
    speech_text: null,
    biome: null,
    field_battle: true,
    last_report: report,
  };
}

export const fieldBattlesHistory = (rows: any[] | null | undefined) => (rows ?? []).map(fieldBattleHistory);
