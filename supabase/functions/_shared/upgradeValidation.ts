/** Building levels are not node infrastructure or route levels. All gameplay upgrades are sequential. */
export function validateBuildingUpgrade(building: any, city: any, actor: string, requested: unknown, template?: any): string | null {
  if (!building || !city || city.owner_player !== actor || building.city_id !== city.id) return 'Budovu lze vylepšit jen ve vlastním městě';
  if (building.status !== 'completed') return 'Nejdříve dokončete stavbu';
  const current = Number(building.current_level ?? 1);
  const max = Number(template?.max_level ?? building.max_level ?? 3);
  if (!Number.isInteger(requested) || Number(requested) !== current + 1) return 'Vylepšení musí zvýšit úroveň právě o jednu';
  if (!Number.isFinite(max) || Number(requested) > max) return 'Budova již dosáhla maximální úrovně';
  return null;
}