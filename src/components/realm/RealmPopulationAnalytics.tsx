import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PopulationPanel from "@/components/economy/PopulationPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { aggregatePopulationTurns, populationCauseSummary, type PopulationLedgerRow } from "@/lib/populationAnalytics";

type City = { id: string; name: string; owner_player: string; population_total?: number; last_migration_in?: number; last_migration_out?: number; [key: string]: unknown };
type MigrationRow = { id: string; turn_number: number; from_node: string | null; to_node: string; population_delta: number; reason: string; route_id: string | null };
type NodeRow = { id: string; name: string; city_id: string | null };

interface Props { sessionId: string; currentTurn: number; currentPlayerName: string; cities: City[]; realm?: unknown }

const fmt = (value: number) => Math.round(value || 0).toLocaleString("cs-CZ");
const signed = (value: number) => `${value > 0 ? "+" : ""}${fmt(value)}`;
const chartConfig = { population: { label: "Populace", color: "hsl(var(--primary))" } } satisfies ChartConfig;

export default function RealmPopulationAnalytics({ sessionId, currentTurn, currentPlayerName, cities, realm }: Props) {
  const myCities = useMemo(() => cities.filter(city => city.owner_player === currentPlayerName), [cities, currentPlayerName]);
  const cityIds = useMemo(() => myCities.map(city => city.id), [myCities]);
  const [ledger, setLedger] = useState<PopulationLedgerRow[]>([]);
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!cityIds.length) { setLedger([]); setMigrations([]); setNodes([]); setLoading(false); return; }
      const [ledgerRes, migrationRes, nodeRes] = await Promise.all([
        supabase.from("city_population_ledger").select("city_id, turn_number, population_before, population_after, births, deaths, local_immigration, intercity_immigration, emigration, extraordinary_losses")
          .eq("session_id", sessionId).in("city_id", cityIds).order("turn_number", { ascending: true }).limit(1000),
        supabase.from("node_migrations").select("id, turn_number, from_node, to_node, population_delta, reason, route_id")
          .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(100),
        supabase.from("province_nodes").select("id, name, city_id").eq("session_id", sessionId),
      ]);
      if (cancelled) return;
      setLedger((ledgerRes.data || []) as PopulationLedgerRow[]);
      setMigrations((migrationRes.data || []) as MigrationRow[]);
      setNodes((nodeRes.data || []) as NodeRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cityIds, sessionId]);

  const turns = useMemo(() => aggregatePopulationTurns(ledger), [ledger]);
  const latest = turns.at(-1);
  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const myNodeIds = useMemo(() => new Set(nodes.filter(node => node.city_id && cityIds.includes(node.city_id)).map(node => node.id)), [nodes, cityIds]);
  const realmMigrations = useMemo(() => migrations.filter(row => myNodeIds.has(row.to_node) || (!!row.from_node && myNodeIds.has(row.from_node))).slice(0, 12), [migrations, myNodeIds]);
  const cityRows = useMemo(() => [...myCities].sort((a, b) => Number(b.population_total || 0) - Number(a.population_total || 0)), [myCities]);

  return <div className="space-y-4">
    <PopulationPanel cities={myCities} realm={realm} />

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />Vývoj populace <Badge variant="outline" className="ml-auto">do kola {currentTurn}</Badge></CardTitle></CardHeader>
        <CardContent className="p-4 pt-2">
          {loading ? <p className="text-xs text-muted-foreground">Načítám demografickou historii…</p> : turns.length ? <>
            <ChartContainer config={chartConfig} className="h-[240px] w-full aspect-auto">
              <AreaChart data={turns.map(turn => ({ turn: turn.turn, population: turn.after }))} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                <defs><linearGradient id="population-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-population)" stopOpacity={0.45}/><stop offset="95%" stopColor="var(--color-population)" stopOpacity={0.04}/></linearGradient></defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="turn" tickLine={false} axisLine={false} tickFormatter={value => `R ${value}`} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={fmt} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={value => `Kolo ${value}`} />} />
                <Area dataKey="population" type="monotone" stroke="var(--color-population)" fill="url(#population-fill)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
            {latest && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Stav po kole" value={fmt(latest.after)} />
              <Metric label="Čistá změna" value={signed(latest.net)} tone={latest.net} />
              <Metric label="Přistěhování" value={signed(latest.localImmigration + latest.intercityImmigration)} tone={1} />
              <Metric label="Odchod a ztráty" value={signed(-(latest.emigration + latest.deaths + latest.extraordinaryLosses))} tone={-1} />
            </div>}
          </> : <EmptyHistory />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Důvody poslední změny</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {latest ? populationCauseSummary(latest).map(cause => <div key={cause.label} className="flex items-center justify-between border-b border-border/50 py-1.5 text-xs"><span className="text-muted-foreground">{cause.label}</span><span className={cause.value > 0 ? "font-mono text-success" : cause.value < 0 ? "font-mono text-destructive" : "font-mono"}>{signed(cause.value)}</span></div>) : <EmptyHistory />}
          {latest && <p className="pt-2 text-[10px] text-muted-foreground">Pouze zaznamenané hodnoty z uzavřeného kola {latest.turn}; nic se nedopočítává ze současných sazeb.</p>}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ArrowRightLeft className="h-4 w-4" />Pohyby obyvatel</CardTitle></CardHeader>
      <CardContent className="p-4 pt-2">
        {realmMigrations.length ? <div className="divide-y divide-border/60">{realmMigrations.map(row => {
          const from = row.from_node ? nodeById.get(row.from_node)?.name : null;
          const to = nodeById.get(row.to_node)?.name || "Neznámý cíl";
          return <div key={row.id} className="grid gap-1 py-2 text-xs sm:grid-cols-[72px_1fr_auto] sm:items-center"><Badge variant="outline">Kolo {row.turn_number}</Badge><span>{from || "Venkov"} → {to}<span className="ml-2 text-muted-foreground">{row.reason || "důvod nebyl zaznamenán"}</span></span><span className="font-mono">{fmt(row.population_delta)} lidí</span></div>;
        })}</div> : <p className="text-xs text-muted-foreground">Trasy migrace zatím nebyly pro tuto říši zaznamenány. Současná souhrnná čísla měst proto nelze pravdivě rozdělit na „odkud → kam“.</p>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4" />Města říše</CardTitle></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="border-y border-border bg-muted/30 text-muted-foreground"><tr><th className="px-4 py-2 text-left">Město</th><th className="px-4 py-2 text-right">Obyvatel</th><th className="px-4 py-2 text-right">Přišlo</th><th className="px-4 py-2 text-right">Odešlo</th><th className="px-4 py-2 text-right">Saldo</th></tr></thead><tbody>{cityRows.map(city => { const incoming = Number(city.last_migration_in || 0); const outgoing = Number(city.last_migration_out || 0); return <tr key={city.id} className="border-b border-border/50"><td className="px-4 py-2 font-medium">{city.name}</td><td className="px-4 py-2 text-right font-mono">{fmt(Number(city.population_total || 0))}</td><td className="px-4 py-2 text-right font-mono text-success">{incoming ? `+${fmt(incoming)}` : "0"}</td><td className="px-4 py-2 text-right font-mono text-destructive">{outgoing ? `−${fmt(outgoing)}` : "0"}</td><td className="px-4 py-2 text-right font-mono">{signed(incoming - outgoing)}</td></tr>; })}</tbody></table></div></CardContent>
    </Card>
  </div>;
}

function Metric({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  const Icon = tone > 0 ? ArrowUpRight : tone < 0 ? ArrowDownRight : Users;
  return <div className="border border-border/60 p-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 flex items-center gap-1 font-mono text-sm font-semibold ${tone > 0 ? "text-success" : tone < 0 ? "text-destructive" : ""}`}><Icon className="h-3 w-3" />{value}</p></div>;
}

function EmptyHistory() { return <p className="text-xs text-muted-foreground">Podrobná historie zatím není zaznamenaná. Zobrazí se po uzávěrkách, které zapíší populační knihu; chybějící narození, úmrtí ani důvody nedopočítáváme.</p>; }