import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Castle, Crosshair, Swords, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { toast } from "sonner";
import type { PendingBattleDecision } from "@/hooks/usePendingBattleDecisions";

const RESULT_LABELS: Record<string, { label: string; className: string }> = {
  decisive_victory: { label: "Drtivé vítězství", className: "text-illuminated" },
  victory: { label: "Vítězství", className: "text-emerald-400" },
  pyrrhic_victory: { label: "Pyrrhovo vítězství", className: "text-amber-400" },
};

interface PostBattleDecisionModalProps {
  decision: PendingBattleDecision | null;
  cityName?: string;
  sessionId: string;
  playerName: string;
  currentTurn: number;
  onClose: () => void;
  onResolved: () => void;
}

export default function PostBattleDecisionModal({
  decision, cityName, sessionId, playerName, currentTurn, onClose, onResolved,
}: PostBattleDecisionModalProps) {
  const [saving, setSaving] = useState(false);
  if (!decision) return null;

  const data = decision.action_data as any;
  const result = RESULT_LABELS[data.result] || { label: data.result, className: "" };
  const defenderSurvived = !!data.defender_survived && !!data.defender_stack_id;

  const handleAction = async (action: "occupy" | "pillage" | "pursue") => {
    setSaving(true);
    try {
      const labels: Record<string, string> = {
        occupy: "okupaci", pillage: "drancování", pursue: "pronásledování",
      };

      // Pillage devastates the city upfront in UI for fast feedback (existing pattern)
      if (action === "pillage" && data.defender_city_id) {
        const { data: city } = await supabase.from("cities")
          .select("city_stability").eq("id", data.defender_city_id).maybeSingle();
        if (city) {
          await supabase.from("cities").update({
            status: "devastated", devastated_round: currentTurn,
            city_stability: Math.max(0, (city.city_stability || 50) - 30),
          }).eq("id", data.defender_city_id);
        }
      }

      await supabase.from("action_queue").update({ status: "executed" }).eq("id", decision.id);

      await dispatchCommand({
        sessionId,
        actor: { name: playerName },
        commandType: "POST_BATTLE_DECISION",
        commandPayload: {
          battleId: data.battle_id,
          decision: action,
          action,
          cityId: data.defender_city_id,
          cityName: cityName,
          decisionId: decision.id,
          attackerStackId: data.attacker_stack_id,
          defenderStackId: data.defender_stack_id,
          chronicleText: action === "pursue"
            ? `Po vítězné bitvě se **${playerName}** rozhodl pronásledovat poraženou armádu u **${cityName || "?"}**.`
            : `Po vítězné bitvě se **${playerName}** rozhodl pro **${labels[action]}** města **${cityName || "?"}**.`,
        },
      });
      toast.success(`Rozhodnutí: ${labels[action]}`);
      onResolved();
      onClose();
    } catch (e) {
      toast.error("Chyba při ukládání rozhodnutí");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!decision} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Swords className="h-5 w-5 text-illuminated" />
            Rozhodnutí po bitvě
          </DialogTitle>
          <DialogDescription>
            <span className={`font-display ${result.className}`}>{result.label}</span>
            {cityName && <> — <span className="font-display">{cityName}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Ztráty: <span className="text-foreground">{data.casualties_attacker}</span> (vy) / <span className="text-foreground">{data.casualties_defender}</span> (obránce)
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Button onClick={() => handleAction("occupy")} disabled={saving} className="justify-start">
              <Castle className="h-4 w-4 mr-2" />
              <div className="text-left">
                <div className="font-display font-semibold">Okupovat město</div>
                <div className="text-xs opacity-80">Po 3 tazích bez osvobození město přejde pod tvou kontrolu.</div>
              </div>
            </Button>

            <Button onClick={() => handleAction("pillage")} disabled={saving} variant="outline" className="justify-start">
              <Flame className="h-4 w-4 mr-2" />
              <div className="text-left">
                <div className="font-display font-semibold">Drancovat</div>
                <div className="text-xs opacity-80">Vyplenit poklady, populace a stabilita drasticky padá. Žádná okupace.</div>
              </div>
            </Button>

            {defenderSurvived && (
              <Button onClick={() => handleAction("pursue")} disabled={saving} variant="destructive" className="justify-start">
                <Crosshair className="h-4 w-4 mr-2" />
                <div className="text-left">
                  <div className="font-display font-semibold">Pronásledovat a rozprášit</div>
                  <div className="text-xs opacity-80">−10% morálka, dalších −10% mužů. Obránce dostane +50% ztrát, šance na zničení.</div>
                </div>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
