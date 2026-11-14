import { useCallback, useEffect, useState } from "react";
import { Loader2, Grape } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { MICRO_RESOURCE_LABEL, type MicroResourceKind } from "../../../supabase/functions/_shared/microResources";
import { MATURE_TURNS, PLANTABLE, PLANT_COST, cropSuits, isMature } from "../../../supabase/functions/_shared/cropSpread";

type Props = { sessionId: string; currentTurn: number; playerName: string; onChanged?: () => void;
  parcel: { id: string; micro_x: number; micro_y: number; sub_biome: string | null; owner_player: string | null; claim_kind?: string | null } };
type Plant = { micro_x: number; micro_y: number; kind: string; planted_turn: number };

/** Plant a crop the player has already found somewhere onto this suitable square; it yields after MATURE_TURNS. */
export default function CropPlantPanel({ sessionId, currentTurn, playerName, parcel, onChanged }: Props) {
  const [sources, setSources] = useState<Set<string> | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [{ data: sv }, { data: cp }] = await Promise.all([
      supabase.from("micro_surveys").select("micro_x, micro_y, findings").eq("session_id", sessionId).eq("player_name", playerName),
      supabase.from("crop_plantings").select("micro_x, micro_y, kind, planted_turn").eq("session_id", sessionId).eq("owner_player", playerName),
    ]);
    const src = new Set<string>();
    for (const r of (sv || []) as any[]) for (const f of r.findings || []) src.add(r.micro_x === parcel.micro_x && r.micro_y === parcel.micro_y ? `here:${f.kind}` : String(f.kind));
    for (const c of (cp || []) as Plant[]) if (isMature(c.planted_turn, currentTurn)) src.add(c.kind);
    setSources(src); setPlants((cp || []) as Plant[]);
  }, [sessionId, playerName, parcel.micro_x, parcel.micro_y, currentTurn]);
  useEffect(() => { void load(); }, [load]);
  if (!sources || parcel.owner_player !== playerName) return null;
  const here = plants.filter(c => c.micro_x === parcel.micro_x && c.micro_y === parcel.micro_y);
  const options = PLANTABLE.filter(k => sources.has(k) && cropSuits(k, parcel.sub_biome) && !sources.has(`here:${k}`) && !here.some(c => c.kind === k));
  if (!here.length && !options.length) return null;
  const plant = async (kind: MicroResourceKind) => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "PLANT_CROP", commandPayload: { parcelId: parcel.id, kind } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Výsadba se nepodařila"); return; }
    toast.success(`${MICRO_RESOURCE_LABEL[kind]} vysazena — plodí za ${MATURE_TURNS} kola`); await load(); onChanged?.();
  };
  return <div className="space-y-1 border border-border/60 bg-background/50 p-2 text-[11px]" data-crop-plant>
    <p className="text-[10px] font-semibold uppercase text-primary">Výsadba</p>
    {here.map(c => { const left = Math.max(0, c.planted_turn + MATURE_TURNS - currentTurn);
      return <p key={c.kind}>{MICRO_RESOURCE_LABEL[c.kind as MicroResourceKind] ?? c.kind}: {left ? `roste, plodí za ${left} ${left === 1 ? "kolo" : "kola"}` : "plodí"}</p>; })}
    {options.map(k => <Button key={k} size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void plant(k)}>
      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Grape className="mr-1 h-3 w-3" />}
      Vysadit: {MICRO_RESOURCE_LABEL[k]} · {PLANT_COST} zlata (plodí za {MATURE_TURNS} kola)
    </Button>)}
  </div>;
}
