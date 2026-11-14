import { useCallback, useEffect, useState } from "react";
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { FARM_FIELD_COST, MAX_FARM_FIELDS, farmFieldReason, isFieldFarm, type FieldParcel } from "../../../supabase/functions/_shared/farmFields";

type Props = { sessionId: string; currentTurn: number; playerName: string; parcel: FieldParcel; macroBiome: string | null; onChanged?: () => void };
type Farm = { parcel: FieldParcel; name: string; recipes: string[]; fields: FieldParcel[] };
const COLS = "id, grid_x, grid_y, parcel_index, sub_biome, city_id, owner_player, claim_kind";

/** Farm fields for one small square: shows the farm's fields, or offers to attach this square to a neighbouring farm. */
export default function FarmFieldPanel({ sessionId, currentTurn, playerName, parcel, macroBiome, onChanged }: Props) {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [fieldOf, setFieldOf] = useState<string | null>(null);
  const [occupied, setOccupied] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!parcel.city_id) { setFarms([]); return; }
    const { data: near } = await supabase.from("tile_parcels").select(COLS).eq("session_id", sessionId).eq("city_id", parcel.city_id)
      .gte("grid_x", parcel.grid_x - 2).lte("grid_x", parcel.grid_x + 2).gte("grid_y", parcel.grid_y - 2).lte("grid_y", parcel.grid_y + 2);
    const list = (near || []) as FieldParcel[];
    const ids = list.map(p => p.id);
    const [{ data: blds }, { data: ff }] = await Promise.all([
      supabase.from("city_buildings").select("parcel_id, name, effects, template_id, status").in("parcel_id", ids.length ? ids : [parcel.id]),
      supabase.from("farm_fields").select("farm_parcel_id, field_parcel_id").eq("session_id", sessionId).in("farm_parcel_id", ids.length ? ids : [parcel.id]),
    ]);
    const tplIds = [...new Set((blds || []).map((b: any) => b.template_id).filter(Boolean))];
    const { data: tpls } = tplIds.length ? await supabase.from("building_templates").select("id, effects").in("id", tplIds) : { data: [] as any[] };
    const byId = new Map(list.map(p => [p.id, p]));
    const out: Farm[] = [];
    for (const b of (blds || []) as any[]) {
      if (b.status !== "completed") continue;
      const recipes = (b.effects?.recipe_keys ?? (tpls || []).find((t: any) => t.id === b.template_id)?.effects?.recipe_keys ?? []).map(String);
      const fp = byId.get(b.parcel_id); if (!fp || !isFieldFarm(recipes)) continue;
      out.push({ parcel: fp, name: b.name, recipes, fields: (ff || []).filter((f: any) => f.farm_parcel_id === fp.id).map((f: any) => byId.get(f.field_parcel_id)).filter(Boolean) as FieldParcel[] });
    }
    setFarms(out);
    setFieldOf(out.find(f => f.fields.some(x => x.id === parcel.id))?.name ?? null);
    setOccupied((blds || []).some((b: any) => b.parcel_id === parcel.id) || (ff || []).some((f: any) => f.field_parcel_id === parcel.id));
  }, [sessionId, parcel.id, parcel.city_id, parcel.grid_x, parcel.grid_y]);
  useEffect(() => { void load(); }, [load]);
  if (!farms || parcel.owner_player !== playerName) return null;
  const own = farms.find(f => f.parcel.id === parcel.id);
  if (own) return <div className="border border-border/60 bg-background/50 p-2 text-[11px]" data-farm-fields>
    <p className="text-[10px] font-semibold uppercase text-primary">Pole farmy</p>
    <p>{own.fields.length} / {MAX_FARM_FIELDS} polí · každé pole +25 % úrody a 3 pracovní místa. Vyber sousední ornou půdu a přidej ji.</p>
  </div>;
  if (fieldOf) return <p className="border border-border/60 bg-background/50 p-2 text-[11px]" data-farm-fields>Pole farmy {fieldOf}.</p>;
  const options = farms.map(f => ({ f, reason: farmFieldReason(f.parcel, f.recipes, parcel, f.fields, occupied, macroBiome) }))
    .filter(o => o.reason === null || !/sousedit/.test(o.reason));
  if (!options.length) return null;
  const add = async (farm: Farm) => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "ADD_FARM_FIELD", commandPayload: { farmParcelId: farm.parcel.id, fieldParcelId: parcel.id } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Pole se nepodařilo přidat"); return; }
    toast.success(`Pole přidáno k farmě ${farm.name}`); await load(); onChanged?.();
  };
  return <div className="space-y-1 border border-border/60 bg-background/50 p-2 text-[11px]" data-farm-fields>
    <p className="text-[10px] font-semibold uppercase text-primary">Pole k farmě</p>
    {options.map(({ f, reason }) => reason
      ? <p key={f.parcel.id} className="text-muted-foreground">{f.name}: {reason}</p>
      : <Button key={f.parcel.id} size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void add(f)}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sprout className="mr-1 h-3 w-3" />}
          Přidat pole k farmě {f.name} ({f.fields.length}/{MAX_FARM_FIELDS}) · {FARM_FIELD_COST} zlata
        </Button>)}
  </div>;
}
