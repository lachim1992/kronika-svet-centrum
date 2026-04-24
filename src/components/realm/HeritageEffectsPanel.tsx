import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface Effect {
  id: string;
  lineage_label: string;
  effect_type: string;
  effect_value: number;
  effect_target: string | null;
  description: string | null;
}

interface Props {
  sessionId: string;
  playerName: string;
}

const formatValue = (type: string, value: number) => {
  if (type.includes("bonus") || type.includes("discount")) {
    return `${value > 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
  }
  return `+${value}`;
};

export const HeritageEffectsPanel = ({ sessionId, playerName }: Props) => {
  const [effects, setEffects] = useState<Effect[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("heritage_effects")
        .select("id, lineage_label, effect_type, effect_value, effect_target, description")
        .eq("session_id", sessionId)
        .eq("player_name", playerName);
      if (mounted) setEffects((data ?? []) as Effect[]);
    })();
    return () => { mounted = false; };
  }, [sessionId, playerName]);

  if (effects.length === 0) return null;

  return (
    <Card className="p-3 space-y-2 bg-gradient-to-br from-amber-500/5 to-purple-500/5 border-amber-500/20">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-amber-300">
        <Sparkles className="h-3.5 w-3.5" /> Aktivní bonusy z dědictví
      </h4>
      <div className="space-y-1.5">
        {effects.map((e) => (
          <div key={e.id} className="flex items-start gap-2 text-xs">
            <Badge variant="outline" className="border-amber-500/40 text-amber-300 shrink-0 tabular-nums">
              {formatValue(e.effect_type, Number(e.effect_value))}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="text-foreground/90 truncate">{e.description}</div>
              <div className="text-[10px] text-muted-foreground">
                {e.lineage_label} → {e.effect_target}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
