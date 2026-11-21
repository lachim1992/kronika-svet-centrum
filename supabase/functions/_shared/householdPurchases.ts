/** Household purchase payment candidates from the canonical goods ledger (balances + prices of this turn).
 * Pure and deterministic. Only actually consumed_household quantities are billed, at the ledger's local_price.
 * A seller is identified only when the city's whole available stock this turn came from local business
 * production (no opening stock, no imports, no household self-production) — stock has no lot provenance,
 * so anything else is 'unmatched' and never billed. No new demand, price or consumption is created. */
export interface PurchaseCandidate { city: string; good: string; consumed: number; unit_price: number | null; seller: string | null; reason: string }

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;

export function householdPurchaseCandidates(ledger: any, ownedCities: string[]): PurchaseCandidate[] {
  const owned = new Set(ownedCities);
  const price = new Map<string, number | null>();
  for (const p of (ledger?.prices || [])) if (p?.city && p?.good) price.set(`${p.city}|${p.good}`, n(p.local_price));
  const out: PurchaseCandidate[] = [];
  for (const b of (ledger?.balances || [])) {
    if (!b || !owned.has(b.city) || typeof b.good !== 'string') continue;
    const consumed = n(b.consumed_household);
    if (consumed == null || consumed <= 0) continue;
    const opening = n(b.opening), imported = n(b.imported), selfMade = n(b.produced_household);
    const business = (n(b.produced_node) ?? 0) + (n(b.produced_facility) ?? 0) + (n(b.produced_district) ?? 0);
    const unit = price.get(`${b.city}|${b.good}`) ?? null;
    const provable = opening === 0 && imported === 0 && selfMade === 0 && business > 0;
    out.push({ city: b.city, good: b.good, consumed: Math.round(consumed * 1000) / 1000,
      unit_price: unit != null && unit > 0 ? unit : null, seller: provable ? b.city : null,
      reason: provable ? 'local_business_only' : 'mixed_or_unknown_provenance' });
  }
  return out.sort((a, b) => a.city.localeCompare(b.city) || a.good.localeCompare(b.good));
}
