import { useCallback, useEffect, useMemo, useState } from "react";
import { Castle, Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { breachChance, microUnits, siegeInRange, wallStrength, type SiegeUnit, type WallSegment } from "../../../supabase/functions/_shared/siege";

type CityLite = { id: string; name: string; grid_x: number | null; grid_y: number | null; owner_player: string; settlement_level: string };
type ArmyLite = { id: string; name: string; player_name: string; soldiers: number; grid_x: number | null; grid_y: number | null; hex_q: number; hex_r: number };
type Siege = { id: string; city_id: string; attacker_player: string; defender_player: string; walls: WallSegment[]; last_report: any; started_turn: number };
type Order = { seq: number; unit_key: string; target: any; side: string };
type Props = { sessionId: string; currentTurn: number; playerName: string; army: ArmyLite; cities: CityLite[]; armies: ArmyLite[];
  selectedUnitKey?: string | null; onSelectUnit?: (key: string | null) => void;
  onSiegeChange?: (v: SiegeMapView | null) => void; mapOrder?: { unitKey: string; target: any; n: number } | null };
export type SiegeMapView = { cityId: string; walls: WallSegment[]; mySide: "attacker" | "defender"; orders: Order[] };

const cell = (a: ArmyLite) => ({ x: a.grid_x ?? a.hex_q, y: a.grid_y ?? a.hex_r });
const targetLabel = (t: any, walls: WallSegment[], name: (k: string) => string) =>
  t?.kind === "wall" ? walls.find(w => w.id === t.segment)?.name ?? "hradba" : t?.kind === "unit" ? name(t.key) : t?.kind === "keep" ? "Hlavní budova" : "—";

/** Siege of an adjacent enemy city: each micro unit (≤200 men) gets one target per turn; resolved at the end of the turn. */
export default function SiegePanel({ sessionId, currentTurn, playerName, army, cities, armies, selectedUnitKey, onSelectUnit, onSiegeChange, mapOrder }: Props) {
  const [siege, setSiege] = useState<Siege | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const here = cell(army);
  const inRange = useMemo(() => cities.filter(c => c.owner_player !== army.player_name && c.grid_x !== null && c.grid_y !== null && siegeInRange(here, { x: c.grid_x!, y: c.grid_y! })), [cities, army.player_name, here.x, here.y]);
  const load = useCallback(async () => {
    const ids = inRange.map(c => c.id);
    if (!ids.length) { setSiege(null); return; }
    const { data } = await supabase.from("sieges").select("id, city_id, attacker_player, defender_player, walls, last_report, started_turn")
      .eq("session_id", sessionId).eq("status", "active").in("city_id", ids).limit(1);
    const sg = (data?.[0] ?? null) as unknown as Siege | null;
    setSiege(sg);
    if (sg) {
      const { data: o } = await supabase.from("siege_orders").select("seq, unit_key, target, side").eq("siege_id", sg.id).eq("turn_number", currentTurn).order("seq");
      setOrders((o || []) as Order[]);
    }
  }, [sessionId, currentTurn, inRange]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    onSiegeChange?.(siege ? { cityId: siege.city_id, walls: siege.walls, mySide: siege.attacker_player === army.player_name ? "attacker" : "defender", orders } : null);
  }, [siege, orders, army.player_name, onSiegeChange]);
  useEffect(() => () => onSiegeChange?.(null), [onSiegeChange]);
  useEffect(() => {
    if (!mapOrder || !siege) return;
    void (async () => {
      setBusy(true);
      const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "SIEGE_ORDER", commandPayload: { siegeId: siege.id, unitKey: mapOrder.unitKey, target: mapOrder.target } });
      setBusy(false);
      if (!res.ok) { toast.error(res.error || "Rozkaz se nepodařil"); return; }
      toast.success(`Oddíl ${Number(mapOrder.unitKey.split(":")[1]) + 1} dostal rozkaz`);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOrder?.n]);
  if (!inRange.length) return null;
  const city = siege ? cities.find(c => c.id === siege.city_id) ?? inRange[0] : inRange[0];
  const start = async () => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "START_SIEGE", commandPayload: { stackId: army.id, cityId: city.id } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Obléhání se nepodařilo zahájit"); return; }
    toast.success(`Obléhání města ${city.name} zahájeno`); await load();
  };
  if (!siege) return <div className="mt-4 border border-destructive/40 p-2 text-xs" data-siege>
    <p className="mb-2 flex items-center gap-1 font-medium"><Castle className="h-3.5 w-3.5" /> {city.name} je na dosah</p>
    <Button size="sm" variant="destructive" className="w-full" disabled={busy} onClick={() => void start()}>
      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Swords className="mr-1 h-3 w-3" />} Zahájit obléhání
    </Button>
  </div>;

  const mySide = siege.attacker_player === army.player_name ? "attacker" : "defender";
  const myUnits: SiegeUnit[] = microUnits(mySide, army.id, army.soldiers, 50);
  const cx = city.grid_x!, cy = city.grid_y!;
  const enemyStacks = armies.filter(a => mySide === "attacker" ? (a.player_name === siege.defender_player && cell(a).x === cx && cell(a).y === cy)
    : (a.player_name === siege.attacker_player && siegeInRange(cell(a), { x: cx, y: cy })));
  const enemyUnits = enemyStacks.flatMap(a => microUnits(mySide === "attacker" ? "defender" : "attacker", a.id, a.soldiers, 50).map(u => ({ ...u, label: `${a.name} · oddíl ${u.idx + 1}` })));
  const unitName = (k: string) => enemyUnits.find(u => u.key === k)?.label ?? (k.startsWith("garrison") ? `Posádka · oddíl ${Number(k.split(":")[1]) + 1}` : myUnits.find(u => u.key === k) ? `${army.name} · oddíl ${Number(k.split(":")[1]) + 1}` : "jednotka");
  const breached = siege.walls.some(w => w.breached);
  const defenders = enemyUnits.reduce((s, u) => s + u.men, 0);
  const order = async (unitKey: string, target: any) => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "SIEGE_ORDER", commandPayload: { siegeId: siege.id, unitKey, target } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Rozkaz se nepodařil"); return; }
    await load();
  };
  const orderAll = async (target: any) => { for (const u of myUnits) await order(u.key, target); };
  const options = [
    ...(mySide === "attacker" ? siege.walls.filter(w => !w.breached).map(w => ({ key: `w${w.id}`, label: `${w.name} (průlom ~${Math.round(breachChance(200, 50, wallStrength(city.settlement_level), defenders) * 100)} %)`, target: { kind: "wall", segment: w.id } })) : []),
    ...enemyUnits.map(u => ({ key: u.key, label: `${u.label} (${u.men})`, target: { kind: "unit", key: u.key } })),
    ...(mySide === "attacker" ? [{ key: "keep", label: "Hlavní budova", target: { kind: "keep" } }] : []),
  ];
  const report = siege.last_report;
  return <div className="mt-4 space-y-2 border border-destructive/40 p-2 text-xs" data-siege>
    <p className="flex items-center gap-1 font-medium"><Castle className="h-3.5 w-3.5" /> Obléhání: {city.name} · od kola {siege.started_turn}</p>
    <div className="flex flex-wrap gap-1">{siege.walls.map(w => <span key={w.id} className={`border px-1.5 py-0.5 ${w.breached ? "border-destructive text-destructive" : "border-border"}`}>{w.name}{w.breached ? " · průlom" : ""}</span>)}</div>
    <p className="text-muted-foreground">{mySide === "attacker" ? (breached ? "Hradba je prolomená — znič obránce a dobuď hlavní budovu." : "Nejdřív prolom hradbu.") : "Bráníš město."} Útočník jedná první, pak rozhoduje pořadí rozkazů. Vyhodnotí se na konci kola.</p>
    {mySide === "attacker" && <p className="text-primary">Na mapě klikni na oddíl a pak na úsek hradby (nebo hlavní budovu).</p>}
    {mySide === "attacker" && !breached && siege.walls[0] && <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void orderAll({ kind: "wall", segment: siege.walls.find(w => !w.breached)!.id })}>Všechny oddíly na {siege.walls.find(w => !w.breached)!.name}</Button>}
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {myUnits.map(u => { const o = orders.find(x => x.unit_key === u.key);
        return <div key={u.key} className={`flex items-center gap-1 border px-1.5 py-1 ${selectedUnitKey === u.key ? "border-primary bg-primary/10" : "border-border"}`} onClick={() => onSelectUnit?.(u.key)}>
          <span className="w-20 shrink-0">Oddíl {u.idx + 1} · {u.men}</span>
          <select className="min-w-0 flex-1 border border-border bg-background px-1 py-0.5" disabled={busy} value={o ? options.find(op => JSON.stringify(op.target) === JSON.stringify(o.target))?.key ?? "" : ""}
            onChange={e => { const op = options.find(x => x.key === e.target.value); if (op) void order(u.key, op.target); }}>
            <option value="">— bez rozkazu —</option>
            {options.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
          </select>
          {o && <span className="text-muted-foreground" title="pořadí rozkazu">#{orders.indexOf(o) + 1}</span>}
        </div>; })}
    </div>
    {report?.events?.length > 0 && <div className="space-y-0.5 border-t border-border pt-1">
      <p className="font-medium">Kolo {report.turn}:</p>
      {report.events.slice(0, 30).map((e: any, i: number) => <p key={i} className={e.side === "attacker" ? "" : "text-muted-foreground"}>
        {i + 1}. {unitName(e.unitKey)} → {targetLabel(e.target, siege.walls, unitName)}: {e.text}</p>)}
    </div>}
  </div>;
}
