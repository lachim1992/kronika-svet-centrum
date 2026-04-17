/**
 * Basket context builder — Economy v4.3
 *
 * Produces a compact text snapshot of the 12 civilizational demand baskets
 * for injection into AI prompts. Aggregates `city_market_baskets` rows by
 * basket_key, computes weighted satisfaction, and emits a sorted, status-flagged
 * list.
 *
 * Scope:
 *   - playerName provided → only that player's cities
 *   - playerName omitted  → world-wide aggregate
 *   - cityId provided     → only that single city (overrides playerName)
 *
 * Used by: economy-advisor, turn-briefing, city-rumors, ai-faction-turn
 */

type BasketTierClass = "need" | "civic" | "upgrade" | "military" | "luxury";

const BASKET_TIER: Record<string, BasketTierClass> = {
  staple_food: "need",
  basic_clothing: "need",
  tools: "need",
  fuel: "need",
  drinking_water: "civic",
  storage_logistics: "civic",
  admin_supplies: "civic",
  construction: "upgrade",
  metalwork: "upgrade",
  military_supply: "military",
  luxury_clothing: "luxury",
  feast: "luxury",
};

const ALL_BASKETS = Object.keys(BASKET_TIER);

interface BuildBasketSnapshotOpts {
  sessionId: string;
  playerName?: string;
  cityId?: string;
  /** Limit emitted lines (default: all 12). */
  limit?: number;
  /** If true, sort by satisfaction asc (worst first). Default: true. */
  worstFirst?: boolean;
}

function statusEmoji(satPct: number): string {
  if (satPct < 50) return "🔴";
  if (satPct < 80) return "⚠️";
  return "✅";
}

/**
 * Build a basket snapshot text block.
 * Returns empty string if no data found (caller decides whether to inject placeholder).
 */
export async function buildBasketSnapshot(
  sb: any,
  opts: BuildBasketSnapshotOpts,
): Promise<string> {
  const { sessionId, playerName, cityId, limit, worstFirst = true } = opts;

  let query = sb
    .from("city_market_baskets")
    .select("basket_key, local_demand, local_supply, auto_supply, bonus_supply, domestic_satisfaction, city_id, player_name")
    .eq("session_id", sessionId);

  if (cityId) {
    query = query.eq("city_id", cityId);
  } else if (playerName) {
    query = query.eq("player_name", playerName);
  }

  const { data: rows, error } = await query.limit(2000);
  if (error || !rows || rows.length === 0) return "";

  // Aggregate by basket_key: weighted satisfaction by local_demand
  const agg = new Map<string, { demand: number; supply: number; satWeighted: number; satWeightSum: number }>();
  for (const r of rows) {
    const key = String(r.basket_key);
    if (!BASKET_TIER[key]) continue; // skip unknown / legacy
    const demand = Number(r.local_demand) || 0;
    const supply = (Number(r.local_supply) || 0) + (Number(r.auto_supply) || 0) + (Number(r.bonus_supply) || 0);
    const sat = Number(r.domestic_satisfaction) || 0; // expected 0..1
    const cur = agg.get(key) || { demand: 0, supply: 0, satWeighted: 0, satWeightSum: 0 };
    cur.demand += demand;
    cur.supply += supply;
    if (demand > 0) {
      cur.satWeighted += sat * demand;
      cur.satWeightSum += demand;
    }
    agg.set(key, cur);
  }

  if (agg.size === 0) return "";

  const lines: { key: string; tier: BasketTierClass; satPct: number; demand: number }[] = [];
  for (const key of ALL_BASKETS) {
    const a = agg.get(key);
    if (!a) continue;
    const satPct = a.satWeightSum > 0
      ? Math.round((a.satWeighted / a.satWeightSum) * 100)
      : (a.demand === 0 ? 100 : 0);
    lines.push({ key, tier: BASKET_TIER[key], satPct, demand: a.demand });
  }

  if (lines.length === 0) return "";

  if (worstFirst) {
    lines.sort((a, b) => a.satPct - b.satPct);
  }

  const sliced = typeof limit === "number" ? lines.slice(0, limit) : lines;

  const scopeLabel = cityId
    ? "city"
    : playerName ? `player=${playerName}` : "world";

  const body = sliced
    .map(l => `- ${l.key} [${l.tier.toUpperCase()}]: ${l.satPct}% ${statusEmoji(l.satPct)}`)
    .join("\n");

  return `[ECONOMY SNAPSHOT — Baskets v4.3, scope: ${scopeLabel}]\n${body}\n(Use only for narrative grounding / advice. Do NOT invent numerical effects.)`;
}
