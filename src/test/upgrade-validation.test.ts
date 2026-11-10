import { it, expect } from 'vitest';
import { validateBuildingUpgrade } from '../../supabase/functions/_shared/upgradeValidation';
const city = { id: 'c', owner_player: 'p' };
const building = { city_id: 'c', status: 'completed', current_level: 2, max_level: 3 };
it('server accepts only a sequential upgrade within the authoritative maximum', () => {
  expect(validateBuildingUpgrade(building, city, 'p', 3)).toBeNull();
  for (const level of [2, 4, 100, 2.5, '3']) expect(validateBuildingUpgrade(building, city, 'p', level)).not.toBeNull();
  expect(validateBuildingUpgrade(building, city, 'p', 3, { max_level: 2 })).not.toBeNull();
});
it('foreign city, unfinished building and false city linkage are rejected before charging', () => {
  expect(validateBuildingUpgrade(building, city, 'enemy', 3)).not.toBeNull();
  expect(validateBuildingUpgrade({ ...building, status: 'building' }, city, 'p', 3)).not.toBeNull();
  expect(validateBuildingUpgrade({ ...building, city_id: 'other' }, city, 'p', 3)).not.toBeNull();
});