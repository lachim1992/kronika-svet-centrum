import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { MICRO_RESOURCE_LABEL, MICRO_SURVEY_COST, certainMicroResources, type MicroFinding } from "../../../supabase/functions/_shared/microResources";

type Props = { sessionId: string; currentTurn: number; playerName: string; gridX: number; gridY: number; parcelIndex: number; subBiome: string | null; macroBiome: string | null; onSurveyed?: () => void };

/** Resources of one sub-square: certain ones are public; rare ones only after the player's own paid survey. */
export default function MicroResourcePanel({ sessionId, currentTurn, playerName, gridX, gridY, parcelIndex, subBiome, macroBiome, onSurveyed }: Props) {
  const mx = gridX * 6 + (parcelIndex % 6), my = gridY * 6 + Math.floor(parcelIndex / 6);
  const [findings, setFindings] = useState<MicroFinding[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    const { data, error } = await supabase.from("micro_surveys").select("findings").eq("session_id", sessionId).eq("player_name", playerName).eq("micro_x", mx).eq("micro_y", my).maybeSingle();
    if (error) setFailed(true);
    setFindings(data ? (data.findings as unknown as MicroFinding[]) : null);
    setLoading(false);
  }, [sessionId, playerName, mx, my]);
  useEffect(() => { void load(); }, [load]);
  const certain = certainMicroResources(subBiome, macroBiome);
  const rare = (findings || []).filter(f => !f.certain);
  const survey = async () => {
    setBusy(true);
    const res = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "SURVEY_MICRO", commandPayload: { gridX, gridY, parcelIndex } });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Průzkum se nepodařil"); return; }
    toast.success("Průzkum políčka dokončen"); await load(); onSurveyed?.();
  };
  return (
    <div className="space-y-2 border border-border/60 bg-background/50 p-2 text-[11px]" data-micro-resources>
      <p className="text-[10px] font-semibold uppercase text-primary">Suroviny políčka</p>
      <div className="flex flex-wrap gap-1">
        {certain.length ? certain.map(k => <Badge key={k} variant="secondary" className="text-[10px]">{MICRO_RESOURCE_LABEL[k]} · jisté</Badge>)
          : <span className="text-muted-foreground">Žádná jistá surovina.</span>}
      </div>
      {loading ? <p className="text-muted-foreground">Načítám průzkum…</p>
        : failed ? <p className="text-destructive">Průzkum se nepodařilo načíst.</p>
        : findings ? <div className="flex flex-wrap gap-1">
            {rare.length ? rare.map(f => <Badge key={f.kind} className="text-[10px]">{MICRO_RESOURCE_LABEL[f.kind]} · nalezeno{f.implemented ? "" : " (zatím bez výroby)"}</Badge>)
              : <span className="text-muted-foreground">Průzkum nic vzácného nenašel.</span>}
          </div>
        : <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void survey()}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Search className="mr-1 h-3 w-3" />}
            Prozkoumat políčko · {MICRO_SURVEY_COST} zlata
          </Button>}
    </div>
  );
}
