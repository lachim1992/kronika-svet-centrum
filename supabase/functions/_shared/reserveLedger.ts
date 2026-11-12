/**
 * Player-command reserve debits/refunds on realm_resources (gold_reserve, production_reserve).
 * Delta-based compare-and-set with retry: a benign concurrent write never fails the command,
 * a refund adds back exactly what was charged (never restores a stale absolute balance),
 * and a charge is applied at most once per call.
 */
export interface ReserveRow { id: string; gold_reserve: number | null; production_reserve: number | null }
export interface ReserveCost { gold: number; production: number }
export interface ReserveIO {
  read(): Promise<ReserveRow | null>;
  /** Write `next` only if the row still holds `expected` (within tolerance). Returns true when written. */
  cas(expected: ReserveRow, next: { gold_reserve: number; production_reserve: number }): Promise<boolean>;
}
export type ChargeResult = { ok: true; before: ReserveRow; after: { gold_reserve: number; production_reserve: number } } | { ok: false; error: string };

export const CAS_EPSILON = 1e-6;
const n = (v: unknown) => Number(v ?? 0) || 0;

export async function chargeReserves(io: ReserveIO, cost: ReserveCost, attempts = 3, first?: ReserveRow | null): Promise<ChargeResult> {
  for (let i = 0; i < attempts; i++) {
    const cur = i === 0 && first ? first : await io.read();
    if (!cur) return { ok: false, error: "Realm not found" };
    const g = n(cur.gold_reserve), p = n(cur.production_reserve);
    if (g + CAS_EPSILON < cost.gold) return { ok: false, error: `Nedostatek zlata (potřeba ${cost.gold}, máš ${Math.floor(g)})` };
    if (p + CAS_EPSILON < cost.production) return { ok: false, error: `Nedostatek produkce (potřeba ${cost.production}, máš ${Math.floor(p)})` };
    const next = { gold_reserve: g - cost.gold, production_reserve: Math.max(0, p - cost.production) };
    if (await io.cas(cur, next)) return { ok: true, before: cur, after: next };
  }
  return { ok: false, error: "Zdroje se mezitím změnily, zkuste to znovu" };
}

export async function refundReserves(io: ReserveIO, cost: ReserveCost, attempts = 5): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const cur = await io.read();
    if (!cur) return false;
    if (await io.cas(cur, { gold_reserve: n(cur.gold_reserve) + cost.gold, production_reserve: n(cur.production_reserve) + cost.production })) return true;
  }
  return false;
}

/** Supabase adapter for one realm_resources row. */
export function realmReserveIO(supabase: any, realmId: string): ReserveIO {
  return {
    async read() {
      const { data } = await supabase.from("realm_resources").select("id,gold_reserve,production_reserve").eq("id", realmId).maybeSingle();
      return data ?? null;
    },
    async cas(e, next) {
      const g = n(e.gold_reserve), p = n(e.production_reserve);
      const { data, error } = await supabase.from("realm_resources").update(next).eq("id", e.id)
        .gte("gold_reserve", g - CAS_EPSILON).lte("gold_reserve", g + CAS_EPSILON)
        .gte("production_reserve", p - CAS_EPSILON).lte("production_reserve", p + CAS_EPSILON)
        .select("id");
      return !error && Array.isArray(data) && data.length > 0;
    },
  };
}
