import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Swords, Shield, Crosshair, Flag, Hammer, Megaphone, Move, Pause, Zap, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import {
  battleInRange, cellKey, maxBattlefieldSquares, validateBattlefield, moveRange, commandPoints, cpUsed, inDeployZone, upgradeUnit,
  UNIT_STATS, FORMATION_INFO, isCavalry, isRanged, MAX_ROUNDS,
  type Cell, type FBUnit, type FBOrder, type FBEvent, type Side, type OrderKind, type BattleMeta,
} from "../../../supabase/functions/_shared/fieldBattle";
import { UNIT_TYPE_LABELS } from "../../../supabase/functions/_shared/unitTypes";

type ArmyLite = { id: string; name: string; player_name: string; soldiers: number; grid_x: number | null; grid_y: number | null; hex_q: number; hex_r: number; controller_player?: string | null };
type Report = { round: number; events: FBEvent[]; winner: string | null; losses?: Record<string, { lost: number; byType: Record<string, number>; soldiers: number; morale: number }> };
type Battle = { id: string; rev?: number; battlefield: Cell[]; status: string; attacker_stack_id: string; defender_stack_id: string; attacker_player: string; defender_player: string;
  units: FBUnit[] | null; orders: FBOrder[]; ready: Record<string, boolean>; round: number; last_report: (Report & { meta?: BattleMeta }) | null; meta?: BattleMeta | null; started_turn: number };
export type BattleMode = OrderKind | null;
export type FieldBattleView = { id: string; cells: Cell[]; units: FBUnit[]; orders: FBOrder[]; status: string; selectedKeys: string[]; activeSide: Side | null;
  attackerPlayer: string; mode: BattleMode; zones: { own: Cell[]; enemy: Cell[] }; reach: { x: number; y: number }[]; reachKind: "move" | "range" | null };
export type FieldBattleClick = { kind: "micro"; x: number; y: number; n: number; shift?: boolean } | { kind: "unit"; key: string; n: number; shift?: boolean };
type Props = { sessionId: string; currentTurn: number; playerName: string; army: ArmyLite; armies: ArmyLite[];
  picked: Cell[]; picking: boolean; onPicking: (on: boolean, initial: Cell[]) => void; onBattlefield: (view: FieldBattleView | null) => void; mapClick?: FieldBattleClick | null };

const cellOf = (a: ArmyLite): Cell => ({ x: a.grid_x ?? a.hex_q, y: a.grid_y ?? a.hex_r });
const typeLabel = (t: string) => UNIT_TYPE_LABELS[t] ?? t;
const unitLabel = (u: FBUnit) => `${typeLabel(u.type)} ${Number(u.key.split(":")[1]) + 1}`;
const ORDER_LABEL: Record<OrderKind, string> = { MOVE: "pohyb", ATTACK: "útok", CHARGE: "náraz", HOLD: "držet", VOLLEY: "salva", FORTIFY: "opevnit", RALLY: "shromáždit", RESERVE: "nástup zálohy" };
const TARGET_MODES: OrderKind[] = ["ATTACK", "CHARGE", "VOLLEY"];
type Filter = "all" | "melee" | "ranged" | "cav" | "reserve";

/** Field battle command panel. All rules come from _shared/fieldBattle.ts; every change goes through command-dispatch. */
export default function FieldBattlePanel({ sessionId, currentTurn, playerName, army, armies, picked, picking, onPicking, onBattlefield, mapClick }: Props) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [finished, setFinished] = useState<Battle | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<BattleMode>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [hideFinished, setHideFinished] = useState(false);
  const here = cellOf(army);
  const enemies = useMemo(() => armies.filter(a => a.player_name !== army.player_name && a.soldiers > 0 && battleInRange(here, cellOf(a))), [armies, army.player_name, here.x, here.y]);
  // "*" so the panel keeps working before the meta column migration is applied.
  const COLS = "*";
  const load = useCallback(async () => {
    const { data } = await supabase.from("field_battles").select(COLS)
      .eq("session_id", sessionId).neq("status", "finished").or(`attacker_stack_id.eq.${army.id},defender_stack_id.eq.${army.id}`).limit(1);
    const next = (data?.[0] ?? null) as unknown as Battle | null;
    setBattle(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    if (!next) {
      const { data: f } = await supabase.from("field_battles").select(COLS).eq("session_id", sessionId).eq("status", "finished")
        .or(`attacker_stack_id.eq.${army.id},defender_stack_id.eq.${army.id}`).order("finished_at", { ascending: false }).limit(1);
      const fin = (f?.[0] ?? null) as unknown as Battle | null;
      setFinished(prev => JSON.stringify(prev) === JSON.stringify(fin) ? prev : (fin && fin.started_turn === currentTurn ? fin : null));
    }
  }, [sessionId, army.id, currentTurn]);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000); return () => clearInterval(t); }, [load]);

  const units = useMemo(() => (battle?.units ?? []).map(upgradeUnit), [battle?.units]);
  const stackOf = (id: string) => armies.find(a => a.id === id);
  const controls = (id: string | undefined) => { const st = id ? stackOf(id) : undefined; return !!st && (st.player_name === playerName || st.controller_player === playerName); };
  const mySides: Side[] = battle ? (["attacker", "defender"] as Side[]).filter(sd => controls(sd === "attacker" ? battle.attacker_stack_id : battle.defender_stack_id)) : [];
  const ownSide: Side | null = battle ? (battle.attacker_stack_id === army.id ? "attacker" : "defender") : null;
  const side: Side | null = activeSide && mySides.includes(activeSide) ? activeSide : ownSide && mySides.includes(ownSide) ? ownSide : mySides[0] ?? null;
  const sideCell = (sd: Side) => { const st = battle ? stackOf(sd === "attacker" ? battle.attacker_stack_id : battle.defender_stack_id) : undefined; return st ? cellOf(st) : null; };
  const zone = useCallback((sd: Side) => (x: number, y: number) => { const o = sideCell(sd), e = sideCell(sd === "attacker" ? "defender" : "attacker"); return !!battle && !!o && !!e && inDeployZone(battle.battlefield, o, e, x, y); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battle, armies]);

  // Map view (display only).
  useEffect(() => {
    if (!battle) { onBattlefield(null); return; }
    const lead = units.find(u => u.key === selected[0]);
    const reach: { x: number; y: number }[] = []; let reachKind: FieldBattleView["reachKind"] = null;
    if (lead && lead.x !== null && battle.status === "fighting") {
      const r = TARGET_MODES.includes(mode as OrderKind) ? (mode === "CHARGE" ? moveRange(lead) + 1 : UNIT_STATS[lead.type].range) : moveRange(lead);
      reachKind = TARGET_MODES.includes(mode as OrderKind) ? "range" : "move";
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const ok = reachKind === "move" || mode === "CHARGE" ? Math.abs(dx) + Math.abs(dy) <= r : Math.max(Math.abs(dx), Math.abs(dy)) <= r;
        if ((dx || dy) && ok) reach.push({ x: lead.x + dx, y: lead.y! + dy });
      }
    }
    const squares = (sd: Side) => battle.battlefield.filter(c => zone(sd)(c.x * 6 + 2, c.y * 6 + 2));
    onBattlefield({ id: battle.id, cells: battle.battlefield, units, orders: battle.orders ?? [], status: battle.status, selectedKeys: selected, activeSide: side,
      attackerPlayer: battle.attacker_player, mode, zones: side ? { own: squares(side), enemy: squares(side === "attacker" ? "defender" : "attacker") } : { own: [], enemy: [] }, reach, reachKind });
  }, [battle, units, onBattlefield, selected, side, mode, zone]);
  useEffect(() => () => { onBattlefield(null); onPicking(false, []); }, [onBattlefield, onPicking]);

  const send = useCallback(async (commandType: string, extra: Record<string, unknown>) => {
    if (!battle) return null;
    setBusy(true);
    const res: any = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType, commandPayload: { battleId: battle.id, side, ...extra } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Příkaz se nepodařil"); await load(); return null; }
    const rej = res.sideEffects?.fieldBattle?.rejected;
    if (Array.isArray(rej) && rej.length) toast.warning(rej.map((r: any) => `${unitLabel(units.find(u => u.key === r.key) ?? ({ key: r.key, type: "MILITIA" } as FBUnit))}: ${r.reason}`).join(" · "));
    await load(); return res;
  }, [battle, sessionId, currentTurn, playerName, side, load, units]);

  const issue = useCallback(async (kind: OrderKind, extra: Record<string, unknown> = {}, keys = selected) => {
    if (!keys.length) { toast.info("Nejdřív vyber oddíly"); return; }
    if (battle && side) {
      const cp = commandPoints((battle.meta ?? battle.last_report?.meta)?.generalSkill?.[side] ?? null);
      const rest = (battle.orders ?? []).filter(o => !keys.includes(o.key));
      const next = [...rest, ...keys.map((key, i) => ({ seq: 1e9 + i, cmd: "__new__", key, kind } as FBOrder))];
      if (cpUsed(next, units, side) > cp) {
        toast.info(`Velitelské body jsou vyčerpané (${cp} za kolo). Zruš některý rozkaz, vyber víc oddílů najednou (skupina stojí 1 bod), nebo ukonči kolo.`);
        return;
      }
    }
    const ok = await send("FIELD_BATTLE_ORDER", { keys, order: { kind, ...extra } });
    if (ok) { setMode(null); setSelected([]); }
  }, [send, selected, battle, side, units]);

  const lastClick = useRef(mapClick?.n ?? 0);
  useEffect(() => {
    if (!mapClick || !battle || mapClick.n === lastClick.current || !side) return;
    lastClick.current = mapClick.n;
    if (mapClick.kind === "unit") {
      const u = units.find(v => v.key === mapClick.key); if (!u) return;
      if (u.side === side) {
        if (mode === "MOVE" || TARGET_MODES.includes(mode as OrderKind)) { if (mode === "MOVE") return; }
        setSelected(l => mapClick.shift ? (l.includes(u.key) ? l.filter(k => k !== u.key) : [...l, u.key]) : (l.length === 1 && l[0] === u.key ? [] : [u.key]));
        return;
      }
      if (battle.status === "fighting" && selected.length) void issue(TARGET_MODES.includes(mode as OrderKind) ? mode as OrderKind : "ATTACK", { target: u.key });
      return;
    }
    if (!selected.length) return;
    if (battle.status === "deploying") {
      const key = selected[0];
      void send("FIELD_BATTLE_DEPLOY", { key, x: mapClick.x, y: mapClick.y }).then(ok => {
        if (!ok) return; const next = units.find(v => v.side === side && (v.x === null) && v.key !== key && v.status !== "dead"); setSelected(next ? [next.key] : []); });
      return;
    }
    if (battle.status === "fighting") {
      const lead = units.find(v => v.key === selected[0]);
      if (lead?.status === "reserve") { void issue("RESERVE", { to: { x: mapClick.x, y: mapClick.y } }, [lead.key]); return; }
      if (lead && lead.x !== null && selected.length === 1 && Math.abs(lead.x - mapClick.x) + Math.abs((lead.y ?? 0) - mapClick.y) > moveRange(lead)) {
        toast.info(`Oddíl dojde za kolo nejvýš ${moveRange(lead)} políčka — vyber zvýrazněné políčko.`); return;
      }
      void issue("MOVE", { to: { x: mapClick.x, y: mapClick.y } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapClick?.n]);

  // ── Finished battle summary ──
  if (!battle && finished && !hideFinished) {
    const r = finished.last_report;
    const att = stackOf(finished.attacker_stack_id), def = stackOf(finished.defender_stack_id);
    const name = (id: string) => stackOf(id)?.name ?? "armáda";
    const fu = (finished.units ?? []).map(upgradeUnit);
    const routed = (id: string) => fu.filter(u => u.stackId === id && u.status === "routed").reduce((s, u) => s + u.men, 0);
    return <div className="mt-4 space-y-2 border border-primary/40 p-2 text-xs" data-field-battle>
      <div className="flex items-center justify-between"><p className="flex items-center gap-1 font-medium"><Flag className="h-3.5 w-3.5" /> Bitva skončila po {r?.round ?? finished.round} kolech</p>
        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Zavřít výsledek" onClick={() => setHideFinished(true)}><X className="h-3 w-3" /></Button></div>
      <p className="font-display text-sm">{r?.winner === "draw" || !r?.winner ? "Nerozhodně" : `Vítězí ${r.winner === "attacker" ? att?.name ?? "útočník" : def?.name ?? "obránce"}`}</p>
      {[finished.attacker_stack_id, finished.defender_stack_id].map(id => { const l = r?.losses?.[id]; return <div key={id} className="border border-border p-1.5">
        <p className="font-medium">{name(id)}</p>
        <p className="text-muted-foreground">Padlo {l?.lost ?? 0} · zůstává {l?.soldiers ?? "?"} · morálka {l?.morale ?? "?"} % · prchající přeživší {routed(id)}</p>
        {l && <p className="text-muted-foreground">{Object.entries(l.byType).filter(([, v]) => v > 0).map(([t, v]) => `${typeLabel(t)} ${v}`).join(" · ") || "bez ztrát"}</p>}
      </div>; })}
      {r && <div className="max-h-28 overflow-y-auto text-muted-foreground">{r.events.map((e, i) => <p key={i}>{e.text}</p>)}</div>}
    </div>;
  }

  if (battle) {
    const att = stackOf(battle.attacker_stack_id), def = stackOf(battle.defender_stack_id);
    const sideName = (sd: Side) => (sd === "attacker" ? att?.name : def?.name) ?? (sd === "attacker" ? "útočník" : "obránce");
    const count = (sd: Side) => { const l = units.filter(u => u.side === sd);
      return { men: l.filter(u => u.status === "ready").reduce((s, u) => s + u.men, 0), ready: l.filter(u => u.status === "ready" && u.x !== null).length, reserve: l.filter(u => u.status === "reserve").length, out: l.filter(u => u.status === "routed" || u.status === "dead").length }; };
    const mine = units.filter(u => u.side === side);
    const shown = mine.filter(u => filter === "all" ? u.status !== "dead" : filter === "reserve" ? u.status === "reserve" : u.status === "ready" && (filter === "cav" ? isCavalry(u.type) : filter === "ranged" ? isRanged(u.type) : !isCavalry(u.type) && !isRanged(u.type)));
    const name = (key: string) => { const u = units.find(v => v.key === key); return u ? `${sideName(u.side)} · ${unitLabel(u)}` : key; };
    const orderOf = (key: string) => (battle.orders ?? []).find(o => o.key === key);
    const cp = side ? commandPoints((battle.meta ?? battle.last_report?.meta)?.generalSkill?.[side] ?? null) : 0;
    const used = side ? cpUsed(battle.orders ?? [], units, side) : 0;
    const lead = units.find(u => u.key === selected[0]);
    const fighting = battle.status === "fighting";
    const initiative: Side = battle.round % 2 === 1 ? "attacker" : "defender";
    const hasGeneral = side ? !!(battle.meta ?? battle.last_report?.meta)?.hasGeneral?.[side] : false;
    const can = (k: OrderKind) => selected.length > 0 && selected.every(key => { const u = units.find(v => v.key === key); if (!u) return false;
      return k === "CHARGE" ? isCavalry(u.type) : k === "VOLLEY" ? ["ARCHERS", "SLINGERS", "JAVELINERS"].includes(u.type) && u.ammo >= 2 : k === "FORTIFY" ? u.type === "ENGINEERS" : k === "RALLY" ? hasGeneral && selected.length === 1 : u.status === "ready"; });
    const OB = ({ k, icon: I }: { k: OrderKind; icon: React.ElementType }) => <Button size="sm" variant={mode === k ? "default" : "outline"} className="h-7 px-2 text-[11px]" disabled={busy || !can(k) || !!battle.ready?.[side!]}
      onClick={() => (k === "HOLD" || k === "FORTIFY" || k === "RALLY") ? void issue(k) : setMode(m => m === k ? null : k)}><I className="mr-1 h-3 w-3" />{ORDER_LABEL[k]}</Button>;
    return <div className="mt-4 space-y-2 border border-destructive/40 p-2 text-xs" data-field-battle>
      <p className="flex items-center gap-1 font-medium"><Swords className="h-3.5 w-3.5" /> Bitva: {sideName("attacker")} × {sideName("defender")}</p>
      <div className="grid grid-cols-2 gap-1">
        {(["attacker", "defender"] as Side[]).map(sd => { const c = count(sd); return <div key={sd} className={`border p-1 ${sd === side ? "border-primary/60" : "border-border"}`}>
          <p className="truncate font-medium">{sd === "attacker" ? "Útočník" : "Obránce"}{battle.ready?.[sd] ? " ✓" : ""}{(battle.meta ?? battle.last_report?.meta)?.ai?.[sd] ? " · AI" : ""}</p>
          <p className="text-muted-foreground">{c.men.toLocaleString("cs-CZ")} mužů · {c.ready} v poli · {c.reserve} záloha · {c.out} mimo</p>
        </div>; })}
      </div>
      <p className="text-muted-foreground">{battle.status === "deploying" ? "Fáze: rozmístění oddílů" : `Kolo ${battle.round}/${MAX_ROUNDS} · první jedná ${initiative === "attacker" ? "útočník" : "obránce"}`}
        {fighting && side ? ` · velení ${used}/${cp} bodů` : ""}</p>
      {mySides.length > 1 && <div className="flex gap-1">{mySides.map(sd => <Button key={sd} size="sm" variant={sd === side ? "default" : "outline"} className="h-7 flex-1"
        onClick={() => { setActiveSide(sd); setSelected([]); setMode(null); }}>{sd === "attacker" ? "Útočník" : "Obránce"}{battle.ready?.[sd] ? " ✓" : ""}</Button>)}</div>}
      {side && <>
        <p>{battle.status === "deploying"
          ? (lead ? `Klikni na políčko ve své zóně (zvýrazněná) pro ${unitLabel(lead)}.` : "Vyber oddíl a klikni do své zóny, nebo rozmísti automaticky.")
          : mode === "MOVE" || (!mode && lead) ? (lead?.status === "reserve" ? "Klikni na volné políčko ve své zóně — záloha nastoupí." : `Klikni na políčko pro pohyb${selected.length > 1 ? " (skupina se posune o stejný krok)" : ""}, nebo na nepřítele pro útok.`)
          : mode ? `Klikni na nepřátelský oddíl (${ORDER_LABEL[mode]}).` : "Vyber oddíly (Shift = víc najednou) a zadej rozkaz. Bez rozkazu oddíl drží pozici."}</p>
        <div className="flex flex-wrap gap-1">
          {(["all", "melee", "ranged", "cav", "reserve"] as Filter[]).map(f => <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} className="h-6 px-2 text-[11px]" onClick={() => setFilter(f)}>
            {f === "all" ? "Vše" : f === "melee" ? "Pěchota" : f === "ranged" ? "Střelci" : f === "cav" ? "Jízda" : "Záloha"}</Button>)}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSelected(shown.filter(u => u.status === "ready" || u.status === "reserve").map(u => u.key))}>Vybrat vše</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => { setSelected([]); setMode(null); }}>Zrušit výběr</Button>
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {shown.map(u => { const o = orderOf(u.key); const st = UNIT_STATS[u.type]; const on = selected.includes(u.key);
            return <label key={u.key} className={`flex cursor-pointer items-center gap-1.5 border px-1.5 py-1 ${on ? "border-primary bg-primary/10" : "border-border"} ${u.status !== "ready" && u.status !== "reserve" ? "opacity-50" : ""}`}>
              <Checkbox checked={on} disabled={u.status === "dead" || u.status === "routed"} onCheckedChange={() => setSelected(l => l.includes(u.key) ? l.filter(k => k !== u.key) : [...l, u.key])} />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-1"><span className="truncate">{unitLabel(u)} · {u.men}</span>
                  <span className="shrink-0 text-muted-foreground">{u.status === "dead" ? "padl" : u.status === "routed" ? "prchá" : u.status === "reserve" ? "záloha" : battle.status === "deploying" ? (u.x === null ? "nerozmístěn" : "✓") : o ? `#${o.cmd ?? o.seq} ${ORDER_LABEL[o.kind] ?? o.kind}` : "drží"}</span></span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1 w-10 bg-muted"><span className="block h-1 bg-primary" style={{ width: `${u.morale}%` }} /></span>{u.morale} %
                  · únava {u.fatigue}{st.ammo > 0 ? ` · munice ${u.ammo}/${st.ammo}` : ""} · {FORMATION_INFO[u.formation]?.label}
                </span>
              </span>
            </label>; })}
        </div>
        {fighting && <div className="flex flex-wrap gap-1">
          <OB k="MOVE" icon={Move} /><OB k="ATTACK" icon={Crosshair} /><OB k="CHARGE" icon={Zap} /><OB k="VOLLEY" icon={Crosshair} />
          <OB k="HOLD" icon={Pause} /><OB k="FORTIFY" icon={Hammer} /><OB k="RALLY" icon={Megaphone} />
          {selected.some(k => orderOf(k)) && <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void send("FIELD_BATTLE_ORDER", { keys: selected, order: { kind: "cancel" } }).then(() => setSelected([]))}>Zrušit rozkaz</Button>}
        </div>}
        <div className="flex gap-2">
          {battle.status === "deploying" && <>
            <Button size="sm" variant="outline" className="flex-1" disabled={busy || !!battle.ready?.[side]} onClick={() => void send("FIELD_BATTLE_DEPLOY", { auto: true })}>Rozmístit automaticky</Button>
            {lead && lead.x !== null && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send("FIELD_BATTLE_DEPLOY", { key: lead.key, x: null, y: null })}><Shield className="mr-1 h-3 w-3" />Do zálohy</Button>}
          </>}
          <Button size="sm" variant="destructive" className="flex-1" disabled={busy || !!battle.ready?.[side]} onClick={() => void send("FIELD_BATTLE_READY", {}).then(() => { setSelected([]); setMode(null); })}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{battle.ready?.[side] ? "Čeká se na soupeře" : battle.status === "deploying" ? "Připraveno k boji" : "Ukončit kolo"}
          </Button>
        </div>
      </>}
      {battle.last_report && <div className="border-t border-border pt-1">
        <p className="font-medium">Hlášení z kola {battle.last_report.round}</p>
        <div className="max-h-32 overflow-y-auto text-muted-foreground">{battle.last_report.events.length ? battle.last_report.events.map((e, i) => <p key={i}>{name(e.key)}{e.target ? ` → ${name(e.target)}` : ""}: {e.text}</p>) : <p>Všichni drželi pozice.</p>}</div>
      </div>}
    </div>;
  }

  if (!enemies.length) return null;
  const target = enemies.find(e => e.id === targetId) ?? null;
  const total = army.soldiers + (target?.soldiers ?? 0);
  const problem = target ? validateBattlefield(picked, here, cellOf(target), total) : null;
  const start = async () => {
    if (!target) return;
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "START_FIELD_BATTLE",
      commandPayload: { stackId: army.id, targetStackId: target.id, battlefield: picked } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Bitvu se nepodařilo vyvolat"); return; }
    toast.success(`Bitva s armádou ${target.name} vyvolána`); onPicking(false, []); setTargetId(null); setHideFinished(false); await load();
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
