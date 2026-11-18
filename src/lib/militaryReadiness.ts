export type SubsistenceFoodRow = { food_status?: string | null };

/** Current committed food report, never the stale realm_resources.famine_city_count projection. */
export function currentFamineCityCount(rows: SubsistenceFoodRow[] | null | undefined): number | null {
  if (!rows) return null;
  return rows.filter(row => row.food_status === "famine").length;
}
