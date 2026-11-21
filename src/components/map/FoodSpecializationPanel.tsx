import { useCallback, useEffect, useState } from "react";
import { Loader2, Wheat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { FOOD_RESOURCES } from "../../../supabase/functions/_shared/foodResources";
import { establishTurns, isFoodFinding } from "../../../supabase/functions/_shared/foodSpecialization";

type Props = { sessionId: string; currentTurn: number; playerName: string; parcelId: string; microX: number; microY: number; onChanged?: () => void };
type Option = { key: string; label: string; sx: number; sy: number };

/** Choose the ONE crop/herd a farm, paddy, vineyard or fishery works. Only own discoveries here or on a 4-adjacent square are offered; the server re-validates. */
export default function FoodSpecializationPanel({ sessionId, currentTurn, playerName, parcelId, microX, microY, onChanged }: Props) {
  const [offered, setOffered] = useState<string[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [current, setCurrent] = useState<{ resource_key: string; chosen_turn: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data: b } = await supabase.from("city_buildings").select("template_id, effects").eq("parcel_id", parcelId).eq("status", "completed").maybeSingle();
    if (!b) { setOffered([]); return; }
    const { data: t } = await supabase.from("building_templates").select("effects").eq("id", (b as any).template_id).maybeSingle();
    const keys: string[] = (((b as any).effects?.specialization_recipe_keys ?? (t as any)?.effects?.specialization_recipe_keys) || []).map(String);
    setOffered(keys);
    const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [microX + dx, microY + dy]);
    const [{ data: surv }, { data: spec }] = await Promise.all([
      supabase.from("micro_surveys").select("micro_x, micro_y, findings").eq("session_id", sessionId).eq("player_name", playerName)
        .gte("micro_x", microX - 1).lte("micro_x", microX + 1).gte("micro_y", microY - 1).lte("micro_y", microY + 1),
      supabase.from("food_specializations").select("resource_key, chosen_turn").eq("session_id", sessionId).eq("site_parcel_id", parcelId).maybeSingle(),
    ]);
    setCurrent(spec as any);
    const opts: Option[] = [];
    for (const r of FOOD_RESOURCES) {
      if (!keys.includes(r.harvest)) continue;
      const hit = (surv || []).find((s: any) => near.some(([x, y]) => x === s.micro_x && y === s.micro_y) && (s.findings || []).some((f: any) => isFoodFinding(f, r.key)));
      if (hit) opts.push({ key: r.key, label: r.label, sx: (hit as any).micro_x, sy: (hit as any).micro_y });
    }
    setOptions(opts);
  }, [sessionId, playerName, parcelId, microX, microY]);
  useEffect(() => { void load(); }, [load]);
  if (!offered || !offered.some(k => k.startsWith("harvest_food_"))) return null;

  const choose = async (o: Option) => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "SET_FOOD_SPECIALIZATION",
      commandPayload: { parcelId, resourceKey: o.key, sourceMicroX: o.sx, sourceMicroY: o.sy } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Specializaci nelze nastavit"); return; }
    toast.success(`Stavba nyní pěstuje / chová: ${o.label}`);
    await load(); onChanged?.();
  };
  const cur = current ? FOOD_RESOURCES.find(r => r.key === current.resource_key) : null;
  const ready = cur ? current!.chosen_turn + establishTurns(cur) : null;
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-2 text-xs">
      <div className="flex items-center gap-1 font-medium"><Wheat className="h-3.5 w-3.5" /> Specializace stavby</div>
      <p className="mt-1 text-muted-foreground">
        {cur ? <>Pěstuje / chová: <b>{cur.label}</b>{ready! > currentTurn ? ` · zakládá se, první úroda v tahu ${ready}` : " · v provozu"}</> : "Zatím bez specializace — stavba vyrábí jen svůj základní výrobek."}
      </p>
      {options.length ? <div className="mt-2 flex flex-wrap gap-1">
        {options.map(o => <Button key={o.key} size="sm" variant={cur?.key === o.key ? "default" : "outline"} disabled={busy || cur?.key === o.key} className="h-6 px-2 text-[10px]" onClick={() => void choose(o)}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : o.label}</Button>)}
      </div> : <p className="mt-1 text-muted-foreground">Žádný nalezený zdroj pro tuto stavbu. Prozkoumej toto nebo sousední (u vody) políčko.</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">Jedna plodina nebo stádo na stavbu; změna znovu spustí zakládání. Stáda rostou jen rozmnožováním, maso je porážka, mléko a vejce stádo neubírají.</p>
    </div>
  );
}
