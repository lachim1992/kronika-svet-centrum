/**
 * Parcel land can replace gathering and ungrounded peat from starter huts.
 * It must NOT silently delete a real staffed fishing facility or a river-intake
 * structure. They are different, identified producers: the land's wild sources
 * and the settlement's installed facility both use explicit workforce.
 *
 * The catch_fish and draw_river_water contracts were granted at founding only
 * where the geography supports them (see starterGeography). They remain
 * subject to canonical producer staffing, physical output and demand.
 * Long-horizon fishery ecology still needs a separate stock-pressure model.
 */
export function suppressStarterLandExtraction(recipeKeys: readonly string[] | null | undefined): boolean {
  const keys = recipeKeys ?? [];
  return keys.length > 0 && keys.every(k => k === 'hunt_game' || k === 'cut_peat');
}
