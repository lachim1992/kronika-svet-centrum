// ═══════════════════════════════════════════════════════════════
// DIPLOMACY ENFORCEMENT (Phase 6)
// Single canonical place where diplomatic pacts gain mechanical teeth:
//  - alliance / defense_pact block a war declaration (break the pact first)
//  - peacetime movement into foreign territory requires open_borders or alliance
// Pure functions here; the DB loaders below only read. No writers.
// ═══════════════════════════════════════════════════════════════

export interface PactLike {
  party_a: string;
  party_b: string;
  pact_type: string;
  status: string;
}
export interface WarLike {
  declaring_player: string;
  target_player: string;
  status: string;
}

/** Pact types that are mutually binding and therefore incompatible with war. */
export const WAR_BLOCKING_PACTS = ["alliance", "defense_pact", "vassalage"];
/** Pact types that grant peacetime passage through the partner's territory. */
export const PASSAGE_PACTS = ["open_borders", "alliance", "vassalage"];

const between = (p: PactLike, a: string, b: string) =>
  (p.party_a === a && p.party_b === b) || (p.party_a === b && p.party_b === a);

export function activePactBetween(
  pacts: PactLike[], a: string, b: string, types: string[],
): PactLike | null {
  return pacts.find(p => p.status === "active" && types.includes(p.pact_type) && between(p, a, b)) ?? null;
}

export function areAtWar(wars: WarLike[], a: string, b: string): boolean {
  return wars.some(w => w.status === "active" &&
    ((w.declaring_player === a && w.target_player === b) ||
     (w.declaring_player === b && w.target_player === a)));
}

const PACT_LABELS: Record<string, string> = {
  alliance: "spojenectví", defense_pact: "obranný pakt", vassalage: "vazalství",
  open_borders: "otevřené hranice",
};

/** Alliances block war: the pact must be broken (BREAK_PACT) before a declaration. */
export function checkWarDeclaration(
  pacts: PactLike[], declarer: string, target: string,
): { ok: true } | { ok: false; error: string; pactType: string } {
  const blocking = activePactBetween(pacts, declarer, target, WAR_BLOCKING_PACTS);
  if (!blocking) return { ok: true };
  return {
    ok: false,
    pactType: blocking.pact_type,
    error: `S ${target} máš platné ${PACT_LABELS[blocking.pact_type] ?? blocking.pact_type}. ` +
      `Nejprve pakt zruš (Zrušit pakt), teprve potom lze vyhlásit válku.`,
  };
}

/** Peacetime passage: foreign land needs war, open borders or an alliance. */
export function checkTerritoryAccess(
  pacts: PactLike[], wars: WarLike[], mover: string, owners: (string | null | undefined)[],
): { ok: true } | { ok: false; error: string; owner: string } {
  const foreign = [...new Set(owners.filter((o): o is string => !!o && o !== mover))];
  for (const owner of foreign) {
    if (areAtWar(wars, mover, owner)) continue;
    if (activePactBetween(pacts, mover, owner, PASSAGE_PACTS)) continue;
    return {
      ok: false,
      owner,
      error: `Území ${owner} je zavřené: v míru potřebuješ otevřené hranice nebo spojenectví, ` +
        `jinak musíš nejprve vyhlásit válku.`,
    };
  }
  return { ok: true };
}

// ── DB loaders (read-only) ───────────────────────────────────────

export async function loadDiplomacyState(supabase: any, sessionId: string): Promise<{ pacts: PactLike[]; wars: WarLike[] }> {
  const [{ data: pacts }, { data: wars }] = await Promise.all([
    supabase.from("diplomatic_pacts").select("party_a, party_b, pact_type, status")
      .eq("session_id", sessionId).eq("status", "active"),
    supabase.from("war_declarations").select("declaring_player, target_player, status")
      .eq("session_id", sessionId).eq("status", "active"),
  ]);
  return { pacts: (pacts || []) as PactLike[], wars: (wars || []) as WarLike[] };
}

/** Owners of the given hexes (topology-aware: square grids use grid_x/grid_y). */
export async function loadHexOwners(
  supabase: any, sessionId: string, hexes: { q: number; r: number }[], gridKind: "hex6" | "square4",
): Promise<(string | null)[]> {
  if (hexes.length === 0) return [];
  const qs = hexes.map(h => h.q), rs = hexes.map(h => h.r);
  let query = supabase.from("province_hexes").select("q, r, grid_x, grid_y, owner_player").eq("session_id", sessionId);
  query = gridKind === "square4"
    ? query.gte("grid_x", Math.min(...qs)).lte("grid_x", Math.max(...qs)).gte("grid_y", Math.min(...rs)).lte("grid_y", Math.max(...rs))
    : query.gte("q", Math.min(...qs)).lte("q", Math.max(...qs)).gte("r", Math.min(...rs)).lte("r", Math.max(...rs));
  const { data } = await query;
  const map = new Map<string, string | null>();
  for (const h of (data || [])) {
    const q = gridKind === "square4" ? h.grid_x : h.q;
    const r = gridKind === "square4" ? h.grid_y : h.r;
    map.set(`${q},${r}`, h.owner_player ?? null);
  }
  return hexes.map(h => map.get(`${h.q},${h.r}`) ?? null);
}

/** Deterministic 32-bit hash — replaces client-side randomness in server decisions. */
export function deterministicSeed(...parts: (string | number | null | undefined)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return Math.abs(h | 0) || 1;
}
