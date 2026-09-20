/**
 * CAPITAL OWNERSHIP — exactly one capital per realm.
 *
 * INVARIANT: every player/faction that owns at least one city has exactly one
 * city with is_capital = true. The selection is deterministic (no randomness, no
 * turn order dependency), so the same city state always resolves to the same
 * capital. This helper is the only sanctioned writer of `cities.is_capital`.
 *
 * It never touches population, treasury, goods or fiscal state.
 */

export type CapitalCandidate = {
  id: string;
  owner_player: string | null;
  is_capital?: boolean | null;
  population_total?: number | null;
  founded_round?: number | null;
  tags?: string[] | null;
};

/**
 * Deterministic capital choice inside one realm:
 *   1. an already-flagged capital (lowest id wins if several)
 *   2. a city tagged "capital" (founding capital from world bootstrap)
 *   3. the largest city, then the oldest, then the lowest id
 */
export function selectCapital(cities: CapitalCandidate[]): CapitalCandidate | null {
  if (!cities.length) return null;
  const byId = (a: CapitalCandidate, b: CapitalCandidate) => String(a.id).localeCompare(String(b.id));
  const flagged = cities.filter((c) => c.is_capital === true).sort(byId);
  if (flagged.length) return flagged[0];
  const tagged = cities.filter((c) => (c.tags || []).includes("capital")).sort(byId);
  if (tagged.length) return tagged[0];
  return cities.slice().sort((a, b) =>
    (Number(b.population_total ?? 0) - Number(a.population_total ?? 0)) ||
    (Number(a.founded_round ?? 0) - Number(b.founded_round ?? 0)) ||
    byId(a, b)
  )[0];
}

export type CapitalRepair = {
  player: string;
  capital: string;
  capital_name?: string;
  promoted: boolean;
  demoted: string[];
};

/**
 * Ensures the invariant for every realm in the session (or only for `owners`).
 * `dryRun` reports what would change without writing anything.
 */
export async function ensureSingleCapital(
  sb: any,
  sessionId: string,
  options: { owners?: string[]; dryRun?: boolean } = {},
): Promise<CapitalRepair[]> {
  let q = sb.from("cities")
    .select("id, name, owner_player, is_capital, population_total, founded_round, tags")
    .eq("session_id", sessionId);
  if (options.owners?.length) q = q.in("owner_player", options.owners);
  const { data: cities } = await q;

  const byOwner = new Map<string, any[]>();
  for (const c of cities || []) {
    const owner = c.owner_player;
    if (!owner) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(c);
  }

  const repairs: CapitalRepair[] = [];
  for (const [player, own] of Array.from(byOwner.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const chosen = selectCapital(own);
    if (!chosen) continue;
    const demoted = own.filter((c) => c.id !== chosen.id && c.is_capital === true).map((c) => c.id);
    const promoted = chosen.is_capital !== true;
    if (!options.dryRun) {
      if (promoted) {
        await sb.from("cities").update({ is_capital: true }).eq("id", chosen.id);
      }
      if (demoted.length) {
        await sb.from("cities").update({ is_capital: false }).in("id", demoted);
      }
    }
    repairs.push({ player, capital: chosen.id, capital_name: (chosen as any).name, promoted, demoted });
  }
  return repairs;
}
