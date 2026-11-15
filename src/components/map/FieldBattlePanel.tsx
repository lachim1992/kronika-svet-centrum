import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { battleInRange, cellKey, maxBattlefieldSquares, validateBattlefield, type Cell } from "../../../supabase/functions/_shared/fieldBattle";

type ArmyLite = { id: string; name: string; player_name: string; soldiers: number; grid_x: number | null; grid_y: number | null; hex_q: number; hex_r: number };
type Battle = { id: string; battlefield: Cell[]; status: string; attacker_stack_id: string; defender_stack_id: string };
type Props = { sessionId: string; currentTurn: number; playerName: string; army: ArmyLite; armies: ArmyLite[];
  picked: Cell[]; picking: boolean; onPicking: (on: boolean, initial: Cell[]) => void; onBattlefield: (cells: Cell[] | null) => void };
const cellOf = (a: ArmyLite): Cell => ({ x: a.grid_x ?? a.hex_q, y: a.grid_y ?? a.hex_r });

/** Start a field battle against an enemy army in reach; the attacker picks the battlefield macro squares on the map. */
export default function FieldBattlePanel({ sessionId, currentTurn, playerName, army, armies, picked, picking, onPicking, onBattlefield }: Props) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = cellOf(army);
  const enemies = useMemo(() => armies.filter(a => a.player_name !== army.player_name && a.soldiers > 0 && battleInRange(here, cellOf(a))), [armies, army.player_name, here.x, here.y]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("field_battles").select("id, battlefield, status, attacker_stack_id, defender_stack_id")
      .eq("session_id", sessionId).neq("status", "finished").or(`attacker_stack_id.eq.${army.id},defender_stack_id.eq.${army.id}`).limit(1);
    setBattle((data?.[0] ?? null) as unknown as Battle | null);
  }, [sessionId, army.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onBattlefield(battle?.battlefield ?? null); }, [battle, onBattlefield]);
  useEffect(() => () => { onBattlefield(null); onPicking(false, []); }, [onBattlefield, onPicking]);
  const target = enemies.find(e => e.id === targetId) ?? null;
  const total = army.soldiers + (target?.soldiers ?? 0);
  const problem = target ? validateBattlefield(picked, here, cellOf(target), total) : null;

  if (battle) {
    const foe = armies.find(a => a.id === (battle.attacker_stack_id === army.id ? battle.defender_stack_id : battle.attacker_stack_id));
    return <div className="mt-4 border border-destructive/40 p-2 text-xs">
      <p className="flex items-center gap-1 font-medium"><Swords className="h-3.5 w-3.5" /> Bitva s armádou {foe?.name ?? "nepřítele"}</p>
      <p className="mt-1 text-muted-foreground">Bojiště: {battle.battlefield.length} makropolí · fáze: rozmístění oddílů (připravuje se).</p>
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
