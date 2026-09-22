/** Map generation used to save a rated base but leave the output at its DB default (0).
 * Preserve explicit capacities and never revive an inactive or player-disabled facility.
 */
export function ratedNodeCapacity(node: { production_output?: unknown; production_base?: unknown; built_by?: unknown; is_active?: boolean }): number {
  if (node.is_active === false) return 0;
  const output = Math.max(0, Number(node.production_output) || 0);
  return output > 0 || node.built_by ? output : Math.max(0, Number(node.production_base) || 0);
}
