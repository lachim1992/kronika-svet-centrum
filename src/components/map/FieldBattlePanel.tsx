import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { battleInRange, cellKey, maxBattlefieldSquares, validateBattlefield, MOVE_RANGE, type Cell, type FBUnit, type FBOrder, type FBEvent, type Side } from "../../../supabase/functions/_shared/fieldBattle";

type ArmyLite = { id: string; name: string; player_name: string; soldiers: number; grid_x: number | null; grid_y: number | null; hex_q: number; hex_r: number };
type Battle = { id: string; battlefield: Cell[]; status: string; attacker_stack_id: string; defender_stack_id: string; attacker_player: string; defender_player: string;
  units: FBUnit[] | null; orders: FBOrder[]; ready: Record<string, boolean>; round: number; last_report: { round: number; events: FBEvent[]; winner: string | null } | null };
export type FieldBattleView = { id: string; cells: Cell[]; units: FBUnit[]; orders: FBOrder[]; status: string; selectedKey: string | null; activeSide: Side | null; attackerPlayer: string };
export type FieldBattleClick = { kind: "micro"; x: number; y: number; n: number } | { kind: "unit"; key: string; n: number };
type Props = { sessionId: string; currentTurn: number; playerName: string; army: ArmyLite; armies: ArmyLite[];
  picked: Cell[]; picking: boolean; onPicking: (on: boolean, initial: Cell[]) => void; onBattlefield: (view: FieldBattleView | null) => void; mapClick?: FieldBattleClick | null };
const cellOf = (a: ArmyLite): Cell => ({ x: a.grid_x ?? a.hex_q, y: a.grid_y ?? a.hex_r });
const TYPE_LABEL: Record<string, string> = { INFANTRY: "pěchota", ARCHERS: "lučištníci", MILITIA: "domobrana", CAVALRY: "jízda" };
const unitLabel = (u: FBUnit) => `${TYPE_LABEL[u.type] ?? u.type} ${Number(u.key.split(":")[1]) + 1}`;

/** Start a field battle against an enemy army in reach; the attacker picks the battlefield macro squares on the map. */
export default function FieldBattlePanel({ sessionId, currentTurn, playerName, army, armies, picked, picking, onPicking, onBattlefield, mapClick }: Props) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = cellOf(army);
  const enemies = useMemo(() => armies.filter(a => a.player_name !== army.player_name && a.soldiers > 0 && battleInRange(here, cellOf(a))), [armies, army.player_name, here.x, here.y]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("field_battles").select("id, battlefield, status, attacker_stack_id, defender_stack_id, attacker_player, defender_player, units, orders, ready, round, last_report")
      .eq("session_id", sessionId).neq("status", "finished").or(`attacker_stack_id.eq.${army.id},defender_stack_id.eq.${army.id}`).limit(1);
    setBattle((data?.[0] ?? null) as unknown as Battle | null);
  }, [sessionId, army.id]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 6000); return () => clearInterval(t); }, [load]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const stackOf = (id: string) => armies.find(a => a.id === id) as (ArmyLite & { controller_player?: string | null }) | undefined;
  const controls = (id: string | undefined) => { const st = id ? stackOf(id) : undefined; return !!st && (st.player_name === playerName || st.controller_player === playerName); };
  const mySides: Side[] = battle ? (["attacker", "defender"] as Side[]).filter(sd => controls(sd === "attacker" ? battle.attacker_stack_id : battle.defender_stack_id)) : [];
  const side: Side | null = activeSide && mySides.includes(activeSide) ? activeSide : mySides[0] ?? null;
  useEffect(() => {
    onBattlefield(battle ? { id: battle.id, cells: battle.battlefield, units: battle.units ?? [], orders: battle.orders ?? [], status: battle.status, selectedKey, activeSide: side, attackerPlayer: battle.attacker_player } : null);
  }, [battle, onBattlefield, selectedKey, side]);
  const send = useCallback(async (commandType: string, extra: Record<string, unknown>) => {
    if (!battle) return false;
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType, commandPayload: { battleId: battle.id, side, ...extra } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Příkaz se nepodařil"); await load(); return false; }
    await load(); return true;
  }, [battle, sessionId, currentTurn, playerName, side, load]);
  const lastClick = useRef(mapClick?.n ?? 0);
  useEffect(() => {
    if (!mapClick || !battle || mapClick.n === lastClick.current || !side) return;
    lastClick.current = mapClick.n;
    const units = battle.units ?? [];
    if (mapClick.kind === "unit") {
      const u = units.find(v => v.key === mapClick.key); if (!u) return;
      if (u.side === side) { setSelectedKey(k => k === u.key ? null : u.key); return; }
      if (battle.status === "fighting" && selectedKey) { void send("FIELD_BATTLE_ORDER", { key: selectedKey, order: { kind: "attack", target: u.key } }).then(ok => ok && setSelectedKey(null)); }
      return;
    }
    if (!selectedKey) return;
    if (battle.status === "deploying") void send("FIELD_BATTLE_DEPLOY", { key: selectedKey, x: mapClick.x, y: mapClick.y }).then(ok => {
      if (!ok) return; const next = units.find(v => v.side === side && v.x === null && v.key !== selectedKey); setSelectedKey(next?.key ?? null); });
    else if (battle.status === "fighting") void send("FIELD_BATTLE_ORDER", { key: selectedKey, order: { kind: "move", to: { x: mapClick.x, y: mapClick.y } } }).then(ok => ok && setSelectedKey(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapClick?.n]);
  useEffect(() => () => { onBattlefield(null); onPicking(false, []); }, [onBattlefield, onPicking]);
  const target = enemies.find(e => e.id === targetId) ?? null;
  const total = army.soldiers + (target?.soldiers ?? 0);
  const problem = target ? validateBattlefield(picked, here, cellOf(target), total) : null;

  if (battle) {
    const units = battle.units ?? [];
    const att = stackOf(battle.attacker_stack_id), def = stackOf(battle.defender_stack_id);
    const sideName = (sd: Side) => (sd === "attacker" ? att?.name : def?.name) ?? (sd === "attacker" ? "útočník" : "obránce");
    const mine = units.filter(u => u.side === side);
    const alive = (sd: Side) => units.filter(u => u.side === sd && u.status === "ready");
    const men = (sd: Side) => alive(sd).reduce((s, u) => s + u.men, 0);
    const name = (key: string) => { const u = units.find(v => v.key === key); return u ? `${sideName(u.side)} · ${unitLabel(u)}` : key; };
    const orderOf = (key: string) => battle.orders.find(o => o.key === key);
    const sel = units.find(u => u.key === selectedKey);
    return <div className="mt-4 space-y-2 border border-destructive/40 p-2 text-xs" data-field-battle>
      <p className="flex items-center gap-1 font-medium"><Swords className="h-3.5 w-3.5" /> Bitva: {sideName("attacker")} × {sideName("defender")}</p>
      <p className="text-muted-foreground">{battle.status === "deploying" ? "Fáze: rozmístění oddílů" : `Bitevní kolo ${battle.round}`} · {men("attacker").toLocaleString("cs-CZ")} × {men("defender").toLocaleString("cs-CZ")} mužů</p>
      {mySides.length > 1 && <div className="flex gap-1">{mySides.map(sd => <Button key={sd} size="sm" variant={sd === side ? "default" : "outline"} className="flex-1" onClick={() => { setActiveSide(sd); setSelectedKey(null); }}>
        {sd === "attacker" ? "Útočník" : "Obránce"}{battle.ready?.[sd] ? " ✓" : ""}</Button>)}</div>}
      {side && <>
        <p>{battle.status === "deploying"
          ? (sel ? `Klikni na políčko na své polovině bojiště pro ${unitLabel(sel)}.` : "Vyber oddíl v seznamu nebo na mapě, pak klikni na políčko. Nebo rozmísti automaticky.")
          : (sel ? `${unitLabel(sel)}: klikni na prázdné políčko (pohyb až ${MOVE_RANGE[sel.type]}) nebo na nepřátelský oddíl (útok${sel.type === "ARCHERS" ? ", střelba až 4" : ", musí sousedit"}).` : "Vyber oddíl a zadej mu jeden rozkaz. Pořadí zadání rozhoduje, útočník jedná první.")}</p>
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {mine.map(u => { const o = orderOf(u.key); return <button key={u.key} type="button" disabled={u.status !== "ready" && battle.status !== "deploying"}
            onClick={() => setSelectedKey(k => k === u.key ? null : u.key)}
            className={`flex w-full justify-between border px-1.5 py-1 text-left ${u.key === selectedKey ? "border-primary bg-primary/10" : "border-border"} ${u.status !== "ready" ? "opacity-50" : ""}`}>
            <span>{unitLabel(u)} · {u.men} · {u.morale} %</span>
            <span className="text-muted-foreground">{u.status === "dead" ? "padl" : u.status === "routed" ? (battle.status === "fighting" && u.x === null ? "v záloze" : "prchá") : battle.status === "deploying" ? (u.x === null ? "nerozmístěn" : "✓") : o ? (o.kind === "move" ? `#${o.seq} pohyb` : `#${o.seq} útok`) : "—"}</span>
          </button>; })}
        </div>
        <div className="flex gap-2">
          {battle.status === "deploying" && <Button size="sm" variant="outline" className="flex-1" disabled={busy || !!battle.ready?.[side]} onClick={() => void send("FIELD_BATTLE_DEPLOY", { auto: true })}>Rozmístit automaticky</Button>}
          {battle.status === "fighting" && sel && orderOf(sel.key) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void send("FIELD_BATTLE_ORDER", { key: sel.key, order: { kind: "cancel" } })}>Zrušit rozkaz</Button>}
          <Button size="sm" variant="destructive" className="flex-1" disabled={busy || !!battle.ready?.[side]} onClick={() => void send("FIELD_BATTLE_READY", {}).then(() => setSelectedKey(null))}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{battle.ready?.[side] ? "Čeká se na soupeře" : battle.status === "deploying" ? "Připraveno k boji" : "Ukončit kolo"}
          </Button>
        </div>
      </>}
      {battle.last_report && <div className="border-t border-border pt-1">
        <p className="font-medium">Kolo {battle.last_report.round}{battle.last_report.winner ? ` · ${battle.last_report.winner === "draw" ? "nerozhodně" : `vítězí ${sideName(battle.last_report.winner as Side)}`}` : ""}</p>
        <div className="max-h-32 overflow-y-auto text-muted-foreground">{battle.last_report.events.map((e, i) => <p key={i}>#{e.seq} {name(e.key)}{e.target ? ` → ${name(e.target)}` : ""}: {e.text}</p>)}</div>
      </div>}
    </div>;
  }
  if (!enemies.length) return null;
  const start = async () => {
    if (!target) return;
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "START_FIELD_BATTLE",
      commandPayload: { stackId: army.id, targetStackId: target.id, battlefield: picked } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Bitvu se nepodařilo vyvolat"); return; }
    toast.success(`Bitva s armádou ${target.name} vyvolána`); onPicking(false, []); setTargetId(null); await load();
  };
  return <div className="mt-4 border border-destructive/40 p-2 text-xs" data-field-battle>
    <p className="mb-2 flex items-center gap-1 font-medium"><Swords className="h-3.5 w-3.5" /> Nepřítel na dosah</p>
    {!picking ? <div className="space-y-1">
      {enemies.map(e => <Button key={e.id} size="sm" variant="destructive" className="w-full justify-between"
        onClick={() => { setTargetId(e.id); onPicking(true, [here, cellOf(e)].filter((c, i, l) => l.findIndex(o => cellKey(o) === cellKey(c)) === i)); }}>
        <span className="truncate">Vyvolat bitvu: {e.name}</span><span>{e.soldiers.toLocaleString("cs-CZ")}</span>
      </Button>)}
    </div> : <div className="space-y-2">
      <p>Klikáním na mapě vyber makropole bojiště (nejvýš {maxBattlefieldSquares(total)}). Musí na sebe navazovat a zahrnout obě armády.</p>
      <p className={problem ? "text-destructive" : "text-muted-foreground"}>Vybráno {picked.length}{problem ? ` · ${problem}` : " · připraveno"}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" className="flex-1" disabled={!!problem || busy} onClick={() => void start()}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Potvrdit bojiště
        </Button>
        <Button size="sm" variant="outline" onClick={() => { onPicking(false, []); setTargetId(null); }}>Zrušit</Button>
      </div>
    </div>}
  </div>;
}
