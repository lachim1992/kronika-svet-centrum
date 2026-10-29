/**
 * Read-only consistency guard between the canonical physical balances and the
 * physical transport journal. No stocks, prices, treasury or turn state are
 * written here. Import postings deliberately use shipped (gross) quantity:
 * the difference to delivered quantity is a destination transport loss.
 */
export interface TradeBalancePosting {
  city: string;
  good: string;
  imported: number;
  exported: number;
  lost_transport: number;
}
export interface TradeFlowPosting {
  source: string;
  destination: string;
  good: string;
  qty: number;
  delivered: number;
}

const postingKey = (city: string, good: string) => JSON.stringify([city, good]);
const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

export function assertPhysicalTradeJournal(
  balances: readonly TradeBalancePosting[],
  flows: readonly TradeFlowPosting[],
): void {
  const postings = new Map<string, { inbound: number; outbound: number; lost: number }>();
  const entry = (city: string, good: string) => {
    const k = postingKey(city, good);
    let p = postings.get(k);
    if (!p) { p = { inbound: 0, outbound: 0, lost: 0 }; postings.set(k, p); }
    return p;
  };

  for (const f of flows) {
    if (!Number.isFinite(f.qty) || !Number.isFinite(f.delivered) ||
        f.qty < 0 || f.delivered < 0 || f.delivered > f.qty + 1e-8)
      throw Error(`Invalid physical trade flow ${f.source} -> ${f.destination} / ${f.good}`);
    entry(f.source, f.good).outbound += f.qty;
    const dest = entry(f.destination, f.good);
    dest.inbound += f.qty;
    dest.lost += f.qty - f.delivered;
  }

  const seen = new Set<string>();
  for (const b of balances) {
    const k = postingKey(b.city, b.good);
    if (seen.has(k)) throw Error(`Duplicate physical balance ${b.city}/${b.good}`);
    seen.add(k);
    const p = postings.get(k) ?? { inbound: 0, outbound: 0, lost: 0 };
    if (!close(b.imported, p.inbound) || !close(b.exported, p.outbound) ||
        !close(b.lost_transport, p.lost))
      throw Error(`Physical trade journal mismatch ${b.city}/${b.good}: ` +
        `import ${b.imported}/${p.inbound}, export ${b.exported}/${p.outbound}, ` +
        `transport loss ${b.lost_transport}/${p.lost}`);
  }
  for (const k of postings.keys())
    if (!seen.has(k)) throw Error(`Physical trade journal has no balance for ${k}`);
}
