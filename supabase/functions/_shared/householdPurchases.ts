/** Household purchase payment candidates from the canonical goods ledger (balances + prices of this turn).
 * Pure and deterministic. Only actually consumed_household quantities are billed, at the ledger's local_price.
 * A seller is identified only when the city's whole available stock this turn came from local business
 * production (no opening stock, no imports, no household self-production) — stock has no lot provenance,
 * so anything else is 'unmatched' and never billed. No new demand, price or consumption is created. */
export interface PurchaseCandidate { city: string; good: string; consumed: number; unit_price: number | null; seller: string | null; reason: string }

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
// A provable physical field must be present, finite and nonnegative; missing/NaN/negative data can never
// establish provenance (fail-closed — physically inconsistent data must not create a cash-backed claim).
const phys = (v: unknown) => { const x = n(v); return x != null && x >= 0 ? x : null; };
const TOL = 1e-8;

export function householdPurchaseCandidates(ledger: any, ownedCities: string[]): PurchaseCandidate[] {
  const owned = new Set(ownedCities);
  const price = new Map<string, number | null>();
  for (const p of (ledger?.prices || [])) if (p?.city && p?.good) price.set(`${p.city}|${p.good}`, n(p.local_price));
  const out: PurchaseCandidate[] = [];
  for (const b of (ledger?.balances || [])) {
    if (!b || !owned.has(b.city) || typeof b.good !== 'string') continue;
    const consumed = phys(b.consumed_household);
    if (consumed == null || consumed <= 0) continue;
    const opening = phys(b.opening), imported = phys(b.imported), selfMade = phys(b.produced_household);
    const node = phys(b.produced_node), facility = phys(b.produced_facility), district = phys(b.produced_district);
    const unit = price.get(`${b.city}|${b.good}`) ?? null;
    // Fail-closed: every key physical field must be provable, and business production must cover the
    // actually consumed quantity (small tolerance for floating-point noise, absolute or relative).
    const fieldsOk = opening != null && imported != null && selfMade != null && node != null && facility != null && district != null;
    const business = fieldsOk ? node! + facility! + district! : 0;
    const covers = fieldsOk && business > 0 && business >= consumed - Math.max(TOL, TOL * Math.max(business, consumed));
    const provable = covers && opening === 0 && imported === 0 && selfMade === 0;
    out.push({ city: b.city, good: b.good, consumed: Math.round(consumed * 1000) / 1000,
      unit_price: unit != null && unit > 0 ? unit : null, seller: provable ? b.city : null,
      reason: provable ? 'local_business_only' : 'mixed_or_unknown_provenance' });
  }
  return out.sort((a, b) => a.city.localeCompare(b.city) || a.good.localeCompare(b.good));
}
