/**
 * HistoryChartsPanel — volitelný panel s grafy vývoje ekonomiky v čase.
 *
 * Read-only nad city_market_baskets (všechny turny, scope = session).
 *  - Domácí vs světové HDP (proxy = sum(local_supply * quality_weight) per turn)
 *  - Vývoj poptávky a nabídky per košík (s volbou košíku)
 *
 * Pozn.: city_market_baskets nemá per-good rozpad — pracujeme na úrovni
 * košíků (12 kanonických). Per-good drill by vyžadoval samostatný snapshot,
 * který zatím v DB není.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  CANONICAL_BASKET_KEYS,
  resolveBasketKey,
  getBasketMeta,
  VALID_BASKETS,
} from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface RawRow {
  turn_number: number;
  player_name: string;
  basket_key: string;
  local_demand: number;
  local_supply: number;
  quality_weight: number;
}

const HistoryChartsPanel = ({ sessionId, currentPlayerName }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [basketFilter, setBasketFilter] = useState<string>(CANONICAL_BASKET_KEYS[0]);

  useEffect(() => {
    if (!open || rows.length > 0) return;
    let canceled = false;
    (async () => {
      setLoading(true);
      // Pagination guard — default Supabase limit is 1000 rows.
      const all: RawRow[] = [];
      const pageSize = 1000;
      let from = 0;
      // Hard cap 20k rows to avoid runaway.
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase
          .from("city_market_baskets")
          .select("turn_number, player_name, basket_key, local_demand, local_supply, quality_weight")
          .eq("session_id", sessionId)
          .order("turn_number", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) break;
        const chunk = (data || []) as RawRow[];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
      if (!canceled) {
        setRows(all);
        setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [open, sessionId, rows.length]);

  // GDP series — proxy: sum(local_supply * quality_weight) per turn
  const gdpSeries = useMemo(() => {
    const byTurn = new Map<number, { world: number; domestic: number }>();
    for (const r of rows) {
      const v = (Number(r.local_supply) || 0) * (Number(r.quality_weight) || 1);
      if (!byTurn.has(r.turn_number)) byTurn.set(r.turn_number, { world: 0, domestic: 0 });
      const b = byTurn.get(r.turn_number)!;
      b.world += v;
      if (r.player_name === currentPlayerName) b.domestic += v;
    }
    return Array.from(byTurn.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([turn, v]) => ({ turn, world: Math.round(v.world), domestic: Math.round(v.domestic) }));
  }, [rows, currentPlayerName]);

  // Basket overview — per turn aggregated demand vs supply for ALL baskets (domestic)
  const basketTotals = useMemo(() => {
    // {turn -> {basketKey -> {demand, supply}}}
    const byTurn = new Map<number, Map<string, { d: number; s: number }>>();
    for (const r of rows) {
      if (r.player_name !== currentPlayerName) continue;
      const key = resolveBasketKey(r.basket_key);
      if (!(VALID_BASKETS as readonly string[]).includes(key)) continue;
      if (!byTurn.has(r.turn_number)) byTurn.set(r.turn_number, new Map());
      const m = byTurn.get(r.turn_number)!;
      if (!m.has(key)) m.set(key, { d: 0, s: 0 });
      const e = m.get(key)!;
      e.d += Number(r.local_demand) || 0;
      e.s += Number(r.local_supply) || 0;
    }
    return byTurn;
  }, [rows, currentPlayerName]);

  // Per-basket series for selected basket
  const basketSeries = useMemo(() => {
    return Array.from(basketTotals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([turn, m]) => {
        const e = m.get(basketFilter);
        return {
          turn,
          demand: e ? Math.round(e.d) : 0,
          supply: e ? Math.round(e.s) : 0,
        };
      });
  }, [basketTotals, basketFilter]);

  // Stacked all-basket supply chart (domestic)
  const allBasketSupplySeries = useMemo(() => {
    return Array.from(basketTotals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([turn, m]) => {
        const row: any = { turn };
        for (const k of CANONICAL_BASKET_KEYS) {
          row[k] = Math.round(m.get(k)?.s ?? 0);
        }
        return row;
      });
  }, [basketTotals]);

  // Top 5 baskets by latest supply for the "all baskets" chart (keeps legend readable)
  const topBaskets = useMemo(() => {
    const last = allBasketSupplySeries[allBasketSupplySeries.length - 1];
    if (!last) return CANONICAL_BASKET_KEYS.slice(0, 5);
    return [...CANONICAL_BASKET_KEYS]
      .sort((a, b) => (last[b] || 0) - (last[a] || 0))
      .slice(0, 5);
  }, [allBasketSupplySeries]);

  const lineColors = [
    "hsl(var(--primary))",
    "hsl(var(--destructive))",
    "hsl(var(--ring))",
    "hsl(var(--accent-foreground))",
    "hsl(var(--muted-foreground))",
  ];

  return (
    <Card className="border-dashed border-border/40">
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-display font-semibold">
              📈 Vývoj v čase — HDP, poptávka & nabídka
            </span>
            <Badge variant="outline" className="text-[9px]">volitelné</Badge>
          </div>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {open && (
          <div className="space-y-6 pt-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : gdpSeries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Žádná historická data nejsou k dispozici.
              </p>
            ) : (
              <>
                {/* GDP chart */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold">HDP (domácí vs světové)</h4>
                    <span className="text-[10px] text-muted-foreground">
                      proxy: Σ local_supply × quality
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={gdpSeries} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                      <XAxis dataKey="turn" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="world" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Svět" />
                      <Line type="monotone" dataKey="domestic" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Domácí" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Per-basket selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-semibold">Košík v čase — poptávka vs nabídka</h4>
                    <div className="flex flex-wrap gap-1">
                      {CANONICAL_BASKET_KEYS.map(k => {
                        const m = getBasketMeta(k);
                        const active = k === basketFilter;
                        return (
                          <Button
                            key={k}
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className="h-6 text-[10px] px-2"
                            onClick={() => setBasketFilter(k)}
                          >
                            {m.icon} {m.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={basketSeries} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                      <XAxis dataKey="turn" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="demand" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Poptávka" />
                      <Line type="monotone" dataKey="supply" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Nabídka" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Top baskets supply chart */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold">Nabídka — Top 5 košíků (domácí)</h4>
                    <span className="text-[10px] text-muted-foreground">
                      podle aktuálního turnu
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={allBasketSupplySeries} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                      <XAxis dataKey="turn" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {topBaskets.map((k, i) => {
                        const m = getBasketMeta(k);
                        return (
                          <Line
                            key={k}
                            type="monotone"
                            dataKey={k}
                            stroke={lineColors[i % lineColors.length]}
                            strokeWidth={1.5}
                            dot={false}
                            name={`${m.icon} ${m.label}`}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[10px] text-muted-foreground italic">
                  Pozn.: Granularita je na úrovni 12 kanonických košíků. Per-good rozpad
                  zatím není v DB snapshotech k dispozici.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoryChartsPanel;
