// Admin-only, read-only Economy Dev Mode. Every number comes from the
// economy-dev-snapshot endpoint (canonical economy_turn_ledgers projection).
// "Načíst znovu" only refetches the snapshot; it never runs refresh-economy.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, RefreshCw, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { fetchEconomyDevSnapshot, toCsv, type EconomyDevSnapshot, type Totals, type FlowRow } from "@/lib/economyDevSnapshot";

const SRC = "economy_turn_ledgers.result (goodsEconomy)";
const f = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(d));
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(0)} %`);
const NA = ({ why }: { why: string }) => <span className="text-muted-foreground italic" title={why}>nedostupné</span>;

type Detail = { title: string; source: string; data: unknown } | null;

function useParam(sp: URLSearchParams, set: (p: URLSearchParams) => void) {
  return (key: string, value: string | null) => { const n = new URLSearchParams(sp); if (value) n.set(key, value); else n.delete(key); set(n); };
}

export default function EconomyDevPanel({ sessionId }: { sessionId: string }) {
  const [sp, setSp] = useSearchParams();
  const setP = useParam(sp, (p) => setSp(p, { replace: true }));
  const tab = sp.get("edv_tab") || "overview", good = sp.get("edv_good") || "", city = sp.get("edv_city") || "";
  const realm = sp.get("edv_realm") || "", q = sp.get("edv_q") || "", warnOnly = sp.get("edv_warn") === "1";
  const turnParam = sp.get("edv_turn"); const turn = turnParam ? Number(turnParam) : null;
  const [detail, setDetail] = useState<Detail>(null);

  const query = useQuery({ queryKey: ["economy-dev-snapshot", sessionId, turn], queryFn: () => fetchEconomyDevSnapshot(sessionId, turn),
    staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  const s = query.data;
  const cityName = useMemo(() => new Map((s?.cities || []).map((c) => [c.id, c.name])), [s]);
  const cityOwner = useMemo(() => new Map((s?.cities || []).map((c) => [c.id, c.owner])), [s]);
  const cn = (id: string) => cityName.get(id) || String(id ?? "—").slice(0, 8);
  const anomalyKeys = useMemo(() => new Set((s?.anomalies || []).flatMap((a) => [a.entity.city, a.entity.good, a.entity.producer, a.entity.flow].filter(Boolean) as string[])), [s]);
  const match = (c?: string, g?: string, extra = "") => (!city || c === city) && (!good || g === good) && (!realm || (c && cityOwner.get(c) === realm))
    && (!q || `${c ? cn(c) : ""} ${g || ""} ${extra}`.toLowerCase().includes(q.toLowerCase()))
    && (!warnOnly || (c && anomalyKeys.has(c)) || (g && anomalyKeys.has(g)) || anomalyKeys.has(extra));

  const filtersObj = { tab, good, city, realm, q, warnOnly, turn: s?.meta.selectedTurn };
  const exportRows = (): object[] => {
    if (!s) return [];
    switch (tab) {
      case "goods": return (s.goods || []).filter((g) => match(undefined, g.good));
      case "producers": return (s.producers?.rows || []).filter((p) => match(p.city, p.output_good, p.id));
      case "demand": return (s.demand?.rows || []).filter((d) => match(d.city, d.good));
      case "flows": return (s.flows?.rows || []).filter((x) => match(x.source, x.good) || match(x.destination, x.good));
      case "cities": return (s.cities || []).filter((c) => match(c.id)).map((c) => ({ ...c, totals: c.totals }));
      case "anomalies": return s.anomalies || [];
      default: return s.goods || [];
    }
  };
  const bundle = () => ({ schemaVersion: s?.meta.schemaVersion, sessionId, turn: s?.meta.selectedTurn, generatedAt: s?.meta.generatedAt,
    ledgerCreatedAt: s?.meta.ledgerCreatedAt, filters: filtersObj, source: SRC, state: s?.state, world: s?.world, anomalies: s?.anomalies, rows: exportRows() });
  const download = (name: string, text: string, type: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };

  if (query.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Načítám diagnostický snapshot…</div>;
  if (query.isError) return <div className="p-4 text-sm text-destructive">Data nedostupná: {(query.error as Error).message} <Button size="sm" variant="outline" onClick={() => query.refetch()}>Zkusit znovu</Button></div>;
  if (!s) return null;
  const realms = [...new Set((s.cities || []).map((c) => c.owner || "—"))].sort();

  return (
    <div className="space-y-3 text-xs">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-lg p-2 flex flex-wrap gap-2 items-center">
        <Badge variant="outline">Session {s.meta.roomCode || sessionId.slice(0, 8)}</Badge>
        <select className="h-8 rounded border bg-background px-2" value={s.meta.selectedTurn ?? ""} onChange={(e) => setP("edv_turn", e.target.value)} aria-label="Tah">
          {s.meta.availableTurns.map((t) => <option key={t.turn_number} value={t.turn_number}>Tah {t.turn_number}{t.committed ? "" : " (necommitnutý)"}</option>)}
        </select>
        <select className="h-8 rounded border bg-background px-2" value={realm} onChange={(e) => setP("edv_realm", e.target.value || null)} aria-label="Říše">
          <option value="">Všechny říše</option>{realms.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="h-8 rounded border bg-background px-2" value={city} onChange={(e) => setP("edv_city", e.target.value || null)} aria-label="Město">
          <option value="">Všechna města</option>{(s.cities || []).filter((c) => !realm || c.owner === realm).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="h-8 rounded border bg-background px-2" value={good} onChange={(e) => setP("edv_good", e.target.value || null)} aria-label="Zboží">
          <option value="">Všechno zboží</option>{(s.goods || []).map((g) => <option key={g.good}>{g.good}</option>)}
        </select>
        <Input className="h-8 w-40" placeholder="Hledat…" value={q} onChange={(e) => setP("edv_q", e.target.value || null)} />
        <label className="flex items-center gap-1"><Switch checked={warnOnly} onCheckedChange={(v) => setP("edv_warn", v ? "1" : null)} /> jen varování</label>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-3 w-3 mr-1 ${query.isFetching ? "animate-spin" : ""}`} />Načíst znovu</Button>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(bundle(), null, 2)); toast.success("Debug bundle zkopírován"); }}><Copy className="h-3 w-3 mr-1" />Debug bundle</Button>
          <Button size="sm" variant="outline" onClick={() => download(`economy-${tab}-t${s.meta.selectedTurn}.json`, JSON.stringify(bundle(), null, 2), "application/json")}><Download className="h-3 w-3 mr-1" />JSON</Button>
          <Button size="sm" variant="outline" onClick={() => download(`economy-${tab}-t${s.meta.selectedTurn}.csv`, toCsv(exportRows()), "text/csv")}><Download className="h-3 w-3 mr-1" />CSV</Button>
        </div>
      </div>

      {s.reason ? <p className="text-muted-foreground p-3">Data nedostupná: {s.reason}</p> : (
      <Tabs value={tab} onValueChange={(v) => setP("edv_tab", v)}>
        <TabsList className="flex flex-wrap h-auto">
          {[["overview", "Přehled"], ["goods", "Zboží"], ["producers", "Výrobci"], ["demand", "Poptávka"], ["flows", "Toky"], ["cities", "Města"], ["chain", "Řetězec"], ["anomalies", `Anomálie (${s.anomalies?.length ?? 0})`]]
            .map(([v, l]) => <TabsTrigger key={v} value={v} className="text-xs">{l}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview"><Overview s={s} onDetail={setDetail} /></TabsContent>

        <TabsContent value="goods">
          <Grid source={SRC + " .balances/.demand/.prices"} rows={(s.goods || []).filter((g) => match(undefined, g.good))} onRow={(g) => { setP("edv_good", g.good); setDetail({ title: `Zboží ${g.good} — rozpad po městech`, source: "result.balances, result.prices", data: (s.balances?.rows || []).filter((b) => b.good === g.good).map((b) => ({ city: cn(b.city), ...b, price: s.prices?.rows.find((p) => p.city === b.city && p.good === b.good) })) }); }}
            cols={[["Zboží", (g) => g.good], ["Výroba", (g) => f(g.produced)], ["Domácnosti", (g) => f(g.demand_household)], ["Průmysl", (g) => f(g.demand_industrial)], ["Stavby", (g) => f(g.demand_construction)], ["Stát/armáda", (g) => f(g.demand_state)],
              ["Obslouženo", (g) => f(g.served)], ["Nenaplněno", (g) => f(g.unmet)], ["Pokrytí", (g) => pct(g.coverage)], ["Otevř.", (g) => f(g.opening)], ["Uzavř.", (g) => f(g.closing)], ["Δ zásob", (g) => f(g.closing - g.opening)],
              ["Dovoz", (g) => f(g.imported)], ["Vývoz", (g) => f(g.exported)], ["Ztráty", (g) => f(g.lost_spoilage)], ["Cena Ø", (g) => f(g.price_avg)], ["min–max", (g) => `${f(g.price_min)}–${f(g.price_max)}`], ["Obch. hodnota", (g) => f(g.trade_value)], ["Měst výr./popt.", (g) => `${g.producing_cities}/${g.demanding_cities}`]]} />
        </TabsContent>

        <TabsContent value="producers">
          <Grid source={SRC + " .snapshot.producers ⨝ .diagnostics"} capped={s.producers} rows={(s.producers?.rows || []).filter((p) => match(p.city, p.output_good, p.id)).sort((a, b) => cn(a.city).localeCompare(cn(b.city)) || (a.node || "").localeCompare(b.node || ""))}
            onRow={(p) => setDetail({ title: `Výrobce ${p.recipe} @ ${cn(p.city)}`, source: "result.snapshot.producers[id], result.diagnostics[producer]", data: p })}
            cols={[["Říše", (p) => cityOwner.get(p.city) || "—"], ["Město", (p) => cn(p.city)], ["Uzel", (p) => (p.node || "—").slice(0, 8)], ["Kanál", (p) => p.channel], ["Receptura", (p) => p.recipe], ["Vstupy→výstup", (p) => `${p.inputs.map((i) => i.good).join("+") || "—"} → ${p.output_good}`],
              ["Kapacita", (p) => f(p.capacity)], ["Místa/obsaz.", (p) => p.jobs_capacity == null ? "—" : `${f(p.employed, 0)}/${f(p.jobs_capacity, 0)}`], ["Potenciál", (p) => f(p.potential_output)], ["Skutečně", (p) => f(p.realized)], ["Využití", (p) => pct(p.utilization)],
              ["Vstupy kryty", (p) => pct(p.input_coverage)], ["Náklad", (p) => f(p.cost)], ["Mat. marže", (p) => f(p.margin)], ["Ztráta", (p) => f(p.lost)], ["Důvod", (p) => p.lost_reason || "—"], ["AUTO", (p) => p.auto_flag || "—"]]} />
        </TabsContent>

        <TabsContent value="demand">
          <p className="text-muted-foreground mb-1">Fyzická potřeba (kanál), lokální cena a naplnění jsou oddělené. Rozpad místní/dovoz je na úrovni město×zboží (ledger), poměrně rozdělený mezi kanály. Efektivní/dostupná poptávka po kanálech: <NA why="goodsEconomy neukládá affordability po kanálu; jen celoměstské cityAccounts.affordability" />.</p>
          <Grid source={SRC + " .demand.channels ⨝ .balances ⨝ .prices ⨝ .productChoice"} capped={s.demand} rows={(s.demand?.rows || []).filter((d) => match(d.city, d.good))}
            onRow={(d) => setDetail({ title: `Poptávka ${d.good} @ ${cn(d.city)}`, source: "result.demand, result.balances, result.productChoice", data: { ...d, choice: d } })}
            cols={[["Město", (d) => cn(d.city)], ["Zboží", (d) => d.good], ["Kanál", (d) => d.channel], ["Původ", (d) => d.provenance], ["Koš/podkoš", (d) => `${d.basket || "—"}/${d.subbasket || "—"}`], ["Potřeba", (d) => f(d.quantity)], ["Cena", (d) => f(d.local_price)],
              ["Místně", (d) => f(d.fulfilled_local)], ["Dovozem", (d) => f(d.fulfilled_import)], ["Nenaplněno", (d) => f(d.unmet)], ["Pokrytí", (d) => pct(d.coverage)], ["Fame", (d) => d.fame == null ? "—" : `${f(d.fame)} ${d.fame_origin ? `(${cn(d.fame_origin)}, ${d.fame_reachable ? "dosažitelné" : "nedosažitelné"})` : ""}`]]} />
        </TabsContent>

        <TabsContent value="flows"><Flows s={s} cn={cn} match={match} selected={sp.get("edv_flow")} onSelect={(fl) => { setP("edv_flow", String(fl.index)); setDetail({ title: `Tok #${fl.index} ${fl.good}: ${cn(fl.source)} → ${cn(fl.destination)}`, source: "result.flows[i], snapshot.edges, snapshot.producers.expectedInputSources", data: fl }); }} /></TabsContent>

        <TabsContent value="cities">
          <Grid source={SRC + " .balances/.cityAccounts/.metrics; fiskál = realm_resources (process-turn)"} rows={(s.cities || []).filter((c) => match(c.id))}
            onRow={(c) => setDetail({ title: `Město ${c.name}`, source: "result.cityAccounts, result.metrics, result.balances, city_capital_stock", data: { ...c, balances: (s.balances?.rows || []).filter((b) => b.city === c.id), capital: s.fiscal?.capitalStock.find((x) => x.city_id === c.id) } })}
            cols={[["Město", (c) => c.name], ["Říše", (c) => c.owner], ["Výroba", (c) => f(c.totals.produced)], ["Spotřeba", (c) => f(c.totals.consumed_household + c.totals.consumed_state)], ["Vstupy", (c) => f(c.totals.consumed_as_input)], ["Dovoz/Vývoz", (c) => `${f(c.totals.imported)}/${f(c.totals.exported)}`], ["Δ zásob", (c) => f(c.totals.closing - c.totals.opening)],
              ["HDP", (c) => f(c.accounts?.city_gdp)], ["Δ HDP", (c) => f(c.gdp_delta)], ["Příjem dom.", (c) => f(c.accounts?.household_income as number)], ["Kupní síla", (c) => f(c.accounts?.purchasing_power as number)], ["Cen. index", (c) => f(c.accounts?.price_index as number)], ["Reál. KS", (c) => f(c.accounts?.real_purchasing_power as number)],
              ["Affordab.", (c) => f(c.accounts?.affordability as number)], ["Prosperita", (c) => f(c.accounts?.prosperity as number)], ["Kapitál", (c) => f(c.accounts?.capital_stock as number)], ["Role", (c) => c.roles?.join(", ") || "—"], ["Top nedostatky", (c) => c.shortages.slice(0, 2).map((x) => x.good).join(", ") || "—"]]} />
          <FiscalBlock s={s} />
        </TabsContent>

        <TabsContent value="chain"><Chain s={s} cn={cn} city={city} good={good} /></TabsContent>

        <TabsContent value="anomalies">
          <Grid source="deterministické kontroly nad snapshotem (economy-dev-snapshot/build.ts runChecks)" rows={s.anomalies || []}
            onRow={(a) => { const n = new URLSearchParams(sp); n.set("edv_tab", a.filter.tab); for (const [k, v] of [["edv_city", a.filter.city], ["edv_good", a.filter.good], ["edv_flow", a.filter.flow != null ? String(a.filter.flow) : undefined], ["edv_q", a.filter.producer]] as const) if (v) n.set(k, v); setSp(n, { replace: true }); }}
            cols={[["Závažnost", (a) => <Badge variant={a.severity === "broken" ? "destructive" : "outline"}>{a.severity}</Badge>], ["Kontrola", (a) => a.check], ["Zpráva", (a) => a.message], ["Entita", (a) => Object.entries(a.entity).map(([k, v]) => `${k}=${k === "city" || k === "supplier" ? cn(v) : v.length > 20 ? v.slice(0, 12) + "…" : v}`).join(" ")],
              ["Pozorováno", (a) => <code className="text-[10px]">{JSON.stringify(a.observed).slice(0, 80)}</code>], ["Očekáváno", (a) => a.expected]]} empty="Žádné anomálie — všechny kontroly prošly." />
        </TabsContent>
      </Tabs>)}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle className="text-sm">{detail?.title}</SheetTitle></SheetHeader>
          <p className="text-[10px] text-muted-foreground mt-1">Zdroj: {detail?.source} · tah {s.meta.selectedTurn} · ledger {s.meta.ledgerCreatedAt}</p>
          <pre className="text-[10px] whitespace-pre-wrap break-all mt-2 bg-muted/30 p-2 rounded">{JSON.stringify(detail?.data, null, 2)}</pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Col<T> = [string, (r: T) => React.ReactNode];
function Grid<T>({ rows, cols, onRow, source, capped, empty = "Žádné řádky (nula, ne chybějící data)." }: { rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; source: string; capped?: { total: number; truncated: boolean }; empty?: string }) {
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(300);
  const sorted = useMemo(() => { if (!sort) return rows; const g = cols[sort.i][1];
    const v = (r: T) => { const x = g(r); const s = typeof x === "string" ? x : String(x ?? ""); const n = parseFloat(s); return Number.isFinite(n) && /^-?[\d.]/.test(s) ? n : s; };
    return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; }); }, [rows, sort, cols]);
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">Zdroj: {source} · {rows.length} řádků{capped?.truncated ? ` (server ořízl z ${capped.total})` : ""}</p>
      {!rows.length ? <p className="text-muted-foreground p-2">{empty}</p> : (
      <div className="overflow-auto max-h-[60vh] border rounded">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card"><tr>{cols.map(([h], i) => <th key={h} className="px-2 py-1 text-left font-semibold whitespace-nowrap cursor-pointer" onClick={() => setSort({ i, dir: sort?.i === i && sort.dir === 1 ? -1 : 1 })}>{h}{sort?.i === i ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
          <tbody>{sorted.slice(0, limit).map((r, ri) => <tr key={ri} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onRow?.(r)}>{cols.map(([h, g]) => <td key={h} className="px-2 py-0.5 whitespace-nowrap tabular-nums">{g(r)}</td>)}</tr>)}</tbody>
        </table>
        {sorted.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 300)}>Zobrazit dalších ({sorted.length - limit})</Button>}
      </div>)}
    </div>
  );
}

function Overview({ s, onDetail }: { s: EconomyDevSnapshot; onDetail: (d: Detail) => void }) {
  const w = s.world as Totals; const an = s.anomalies || [];
  const broken = an.filter((a) => a.severity === "broken").length, warn = an.filter((a) => a.severity === "warning").length;
  const lastGuard = s.state?.guards[0];
  const status = broken ? "broken" : warn ? "warning" : "OK";
  const kv: [string, React.ReactNode][] = [["Aktuální tah", s.meta.currentTurn], ["Vybraný ledger", `${s.meta.selectedTurn} (${s.meta.ledgerCommitted ? "committed" : "necommitnutý"})`], ["Poslední committed", s.meta.lastCommittedTurn ?? "—"],
    ["Ledger vytvořen", s.meta.ledgerCreatedAt], ["Snapshot", s.meta.generatedAt], ["resolving_turn", s.meta.resolvingTurn ?? "žádný"], ["Refresh zámek", s.state?.refreshLock ? `drží ${s.state.refreshLock.locked_by} od ${s.state.refreshLock.locked_at}` : "volný"],
    ["Rozpočtový režim", s.meta.budgetMode ?? "—"], ["Guard", lastGuard ? `tah ${lastGuard.turn_number}: ${lastGuard.status}${lastGuard.error ? ` — ${lastGuard.error}` : ""}` : "—"], ["Fáze journalu", `${s.state?.journal.length ?? 0}`],
    ["Města", s.cities?.length ?? 0], ["Výrobci", s.producers?.total ?? 0], ["Aktivní (realized>0)", (s.producers?.rows || []).filter((p) => p.realized > 0).length], ["Zboží", s.goods?.length ?? 0], ["Realizované toky", s.flows?.total ?? 0],
    ["Legacy trade_routes (oddělené)", `${s.legacy?.active}/${s.legacy?.total} aktivních, ${f(s.legacy?.goldPerTurn)} zlata/tah`]];
  const closingCalc = w.opening + w.produced + w.imported - w.consumed_household - w.consumed_state - w.consumed_as_input - w.exported - w.lost_spoilage - w.capex;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center"><Badge variant={status === "broken" ? "destructive" : "outline"}>{status}</Badge>
        <span>{broken} rozbitých, {warn} varování{an[0] ? ` — např. ${an[0].check}: ${an[0].message}` : ""}</span></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">{kv.map(([k, v]) => <div key={k} className="border rounded p-1.5"><p className="text-[10px] text-muted-foreground">{k}</p><p className="font-mono break-all">{v}</p></div>)}</div>
      <div className="border rounded p-2 space-y-1">
        <p className="font-semibold">Zachování hmoty (svět, zdroj: Σ result.balances)</p>
        <p className="font-mono">{f(w.opening)} otevř. + {f(w.produced)} výroba + {f(w.imported)} dovoz − {f(w.consumed_household)} domácnosti − {f(w.consumed_state)} stát − {f(w.consumed_as_input)} průmysl. vstupy − {f(w.exported)} vývoz − {f(w.lost_spoilage)} ztráty − {f(w.capex)} CAPEX = {f(closingCalc)} (uloženo {f(w.closing)}, reziduum {w.residual.toExponential(2)})</p>
        <p className="font-mono">Poptávka {f(w.demand)} · obslouženo {f(w.served)} · nenaplněno {f(w.unmet)} · hrubá produkce {f(w.gross_output_value)} · mezispotřeba {f(w.intermediate_value)} · obchod {f((s.flows?.rows || []).reduce((a, x) => a + x.gross_value, 0))}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onDetail({ title: "Stav tahu (guard/journal/zámek)", source: "turn_execution_guards, turn_phase_journal, economy_recompute_locks", data: s.state })}>Detail stavu tahu</Button>
    </div>
  );
}

function FiscalBlock({ s }: { s: EconomyDevSnapshot }) {
  return (
    <div className="mt-3 border rounded p-2">
      <p className="font-semibold">Fiskální výsledky (pouze process-turn) — {s.fiscal?.source}</p>
      <div className="overflow-auto"><table className="text-[11px]"><thead><tr>{["player_name", "gold_reserve", "legitimacy", "total_wealth", "wealth_pop_tax", "wealth_domestic_market", "goods_wealth_fiscal", "military_gold_upkeep", "value_added_gdp", "last_processed_turn"].map((h) => <th key={h} className="px-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{(s.fiscal?.realms || []).map((r, i) => <tr key={i} className="border-t">{["player_name", "gold_reserve", "legitimacy", "total_wealth", "wealth_pop_tax", "wealth_domestic_market", "goods_wealth_fiscal", "military_gold_upkeep", "value_added_gdp", "last_processed_turn"].map((h) => <td key={h} className="px-2 tabular-nums">{typeof r[h] === "number" ? f(r[h] as number) : String(r[h] ?? "—")}</td>)}</tr>)}</tbody></table></div>
      <p className="text-[10px] text-muted-foreground mt-1">Daňový základ po městech: <NA why="process-turn ukládá daně jen po říších (realm_resources); městský rozpad se neukládá" />.</p>
    </div>
  );
}

function Flows({ s, cn, match, selected, onSelect }: { s: EconomyDevSnapshot; cn: (id: string) => string; match: (c?: string, g?: string, e?: string) => boolean; selected: string | null; onSelect: (f: FlowRow) => void }) {
  const [mode, setMode] = useState<"qty" | "value">("qty"); const [minQ, setMinQ] = useState(0);
  const rows = (s.flows?.rows || []).filter((x) => (match(x.source, x.good) || match(x.destination, x.good)) && x.qty >= minQ);
  const pos = new Map((s.cities || []).map((c) => { const [q, r] = c.cell.split(",").map(Number); return [c.id, { x: q, y: r, name: c.name }]; }));
  const pts = [...pos.values()]; const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const W = 600, H = 320, sx = (x: number) => 20 + ((x - minX) / (maxX - minX || 1)) * (W - 40), sy = (y: number) => 20 + ((y - minY) / (maxY - minY || 1)) * (H - 40);
  const maxV = Math.max(1e-9, ...rows.map((r) => (mode === "qty" ? r.qty : r.gross_value)));
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center"><Button size="sm" variant={mode === "qty" ? "default" : "outline"} onClick={() => setMode("qty")}>Šířka = množství</Button><Button size="sm" variant={mode === "value" ? "default" : "outline"} onClick={() => setMode("value")}>Šířka = hodnota</Button>
        <label>min. množství <Input type="number" className="h-7 w-20 inline-block" value={minQ} onChange={(e) => setMinQ(Number(e.target.value) || 0)} /></label>
        <span className="text-muted-foreground">Blokované/zamítnuté kandidáty: <NA why="goodsEconomy nezaznamenává odmítnuté kandidátní toky; jen snapshot.blockedTrade (vstup) a diagnostics.blocked u výrobců" /></span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border rounded bg-muted/10" role="img" aria-label="Síť toků">
        <defs><marker id="edv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" className="fill-primary" /></marker></defs>
        {rows.slice(0, 500).map((r) => { const a = pos.get(r.source), b = pos.get(r.destination); if (!a || !b) return null;
          const w = 1 + 6 * ((mode === "qty" ? r.qty : r.gross_value) / maxV);
          return <line key={r.index} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} strokeWidth={w} markerEnd="url(#edv-arrow)" className={`cursor-pointer ${selected === String(r.index) ? "stroke-destructive" : "stroke-primary"}`} opacity={0.7} onClick={() => onSelect(r)}><title>{`${r.good} ${cn(r.source)}→${cn(r.destination)} ${f(r.qty)}`}</title></line>; })}
        {[...pos.entries()].map(([id, p]) => <g key={id}><circle cx={sx(p.x)} cy={sy(p.y)} r={3.5} className="fill-foreground" /><text x={sx(p.x) + 5} y={sy(p.y) - 4} className="fill-muted-foreground" fontSize={9}>{p.name}</text></g>)}
      </svg>
      <Grid source="result.flows ⨝ snapshot.edges ⨝ snapshot.producers.expectedInputSources" capped={s.flows} rows={rows} onRow={onSelect} empty="V tomto tahu nebyl realizován žádný mezi-městský tok (nula). Zkuste jiný tah."
        cols={[["#", (r) => r.index], ["Zboží", (r) => r.good], ["Z", (r) => cn(r.source)], ["Do", (r) => cn(r.destination)], ["Důvod", (r) => r.reason], ["Odesláno", (r) => f(r.qty, 3)], ["Dodáno", (r) => f(r.delivered, 3)], ["Ztráta", (r) => f(r.loss_qty, 3)],
          ["Cena zdroj", (r) => f(r.source_price)], ["Doprava", (r) => f(r.transport_cost, 3)], ["Mýto/clo", (r) => f(r.tolls, 3)], ["Landed/ks", (r) => f(r.landed_unit_cost)], ["Hodnota", (r) => f(r.gross_value)], ["Trasa", (r) => r.path.join("→")],
          ["Kapacita hran", (r) => r.edge_capacity.map((e) => `${f(e.used_total, 2)}/${e.capacity == null ? "?" : f(e.capacity, 0)}`).join(" ")], ["Plán (cena)", (r) => r.planned.length ? r.planned.map((p) => f(p.expected_cost)).join(", ") : "—"], ["Famous", (r) => r.famous || "—"]]} />
    </div>
  );
}

function Chain({ s, cn, city, good }: { s: EconomyDevSnapshot; cn: (id: string) => string; city: string; good: string }) {
  if (!city || !good) return <p className="text-muted-foreground p-2">Vyberte ve filtru město a výstupní zboží.</p>;
  const prods = (s.producers?.rows || []).filter((p) => p.city === city && p.output_good === good);
  const flows = s.flows?.rows || [];
  const downstream = (s.producers?.rows || []).filter((p) => p.inputs.some((i) => i.good === good) && (p.city === city || flows.some((x) => x.source === city && x.destination === p.city && x.good === good)));
  const bal = s.balances?.rows.find((b) => b.city === city && b.good === good);
  return (
    <div className="space-y-2">
      {!prods.length && <p className="text-muted-foreground">V {cn(city)} není žádný výrobce {good} (nula výroby z receptur).</p>}
      {prods.map((p) => { const blockIdx = p.inputs.findIndex((i) => i.expected_available === false || (i.required != null && (i.supplied ?? 0) + 1e-9 < i.required));
        return (
        <div key={p.id} className="border rounded p-2 space-y-1">
          <p className="font-semibold">{p.recipe} → {f(p.realized)} {p.output_good} (kapacita {f(p.capacity)}, ztráta {f(p.lost)}{p.lost_reason ? `: ${p.lost_reason}` : ""})</p>
          {p.inputs.length ? p.inputs.map((i, idx) => { const actual = flows.filter((x) => x.destination === city && x.good === i.good);
            return <div key={i.good} className={`pl-3 border-l-2 ${idx === blockIdx ? "border-destructive" : "border-border"}`}>
              <p>{idx === blockIdx && <Badge variant="destructive" className="mr-1">první omezení</Badge>}{i.good}: potřeba {f(i.required)} / dodáno {f(i.supplied)} ({i.qty_per_run}/běh)</p>
              <p className="text-muted-foreground">Plán: {i.expected_source ? `${i.expected_source === city || i.expected_source === "local" ? "místní" : cn(i.expected_source)} @ ${f(i.expected_cost)}` : "—"} ({i.expected_available == null ? "bez plánu" : i.expected_available ? "dostupné" : "nedostupné"})
                · Skutečně: {actual.length ? actual.map((x) => `${cn(x.source)} ${f(x.delivered, 3)} @ ${f(x.landed_unit_cost)}`).join("; ") : `bez dovozu${i.expected_source && i.expected_source !== city && i.expected_source !== "local" ? " — plánovaný vzdálený dodavatel nedodal" : " (místní zdroj)"}`}</p>
            </div>; }) : <p className="pl-3 text-muted-foreground">Bez vstupů (zdrojová receptura).</p>}
        </div>); })}
      <div className="border rounded p-2"><p className="font-semibold">Následní uživatelé / poptávka</p>
        <p>Poptávka v {cn(city)}: {f(bal?.demand)} (nenaplněno {f(bal?.unmet_demand)}), vývoz {f(bal?.exported)}</p>
        {downstream.map((p) => <p key={p.id} className="text-muted-foreground">{cn(p.city)} · {p.recipe} (vstup {good}, realizováno {f(p.realized)})</p>)}
        {!downstream.length && <p className="text-muted-foreground">Žádná receptura toto zboží nespotřebovává.</p>}
      </div>
    </div>
  );
}
