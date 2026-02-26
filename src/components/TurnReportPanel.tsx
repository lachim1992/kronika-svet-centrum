import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Swords, Wheat, Building2, AlertTriangle, MessageSquare, TrendingUp, Scroll } from "lucide-react";

interface TurnReportItem {
  icon: React.ElementType;
  category: string;
  text: string;
  tone: "info" | "success" | "warning" | "danger";
}

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
}

const toneColors = {
  info: "text-muted-foreground",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-red-400",
};

const toneBg = {
  info: "bg-muted/30",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  danger: "bg-red-500/10",
};

const TurnReportPanel = ({ sessionId, playerName, currentTurn }: Props) => {
  const [items, setItems] = useState<TurnReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const lastTurn = currentTurn - 1;

  useEffect(() => {
    if (lastTurn < 1) { setLoading(false); return; }

    const load = async () => {
      const [
        { data: events },
        { data: battles },
        { data: rumors },
        { data: buildings },
        { data: uprisings },
      ] = await Promise.all([
        supabase.from("game_events").select("event_type, note, importance, player")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("confirmed", true).limit(50),
        supabase.from("battles").select("result, casualties_attacker, casualties_defender, defender_city_id")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).limit(20),
        supabase.from("city_rumors").select("text, tone_tag, city_name")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("is_draft", false).limit(20),
        supabase.from("city_buildings").select("name, city_id")
          .eq("session_id", sessionId).eq("completed_turn", lastTurn).limit(20),
        supabase.from("city_uprisings").select("city_id, escalation_level, status")
          .eq("session_id", sessionId).eq("turn_triggered", lastTurn).limit(10),
      ]);

      const result: TurnReportItem[] = [];

      // Battles
      for (const b of (battles || [])) {
        const isVictory = b.result?.includes("victory");
        result.push({
          icon: Swords,
          category: "Bitva",
          text: `${b.result} — ztráty: ${b.casualties_attacker}/${b.casualties_defender}`,
          tone: isVictory ? "success" : "danger",
        });
      }

      // Uprisings
      for (const u of (uprisings || [])) {
        result.push({
          icon: AlertTriangle,
          category: "Vzpoura",
          text: `Úroveň ${u.escalation_level} — ${u.status}`,
          tone: "danger",
        });
      }

      // Completed buildings
      for (const b of (buildings || [])) {
        result.push({
          icon: Building2,
          category: "Stavba",
          text: `„${b.name}\" dokončena`,
          tone: "success",
        });
      }

      // Trade raids and other events
      for (const e of (events || [])) {
        if (e.event_type === "battle") continue; // Already shown from battles table
        const isCritical = e.importance === "critical";
        result.push({
          icon: e.event_type === "trade_raid" ? TrendingUp
            : e.event_type === "famine" ? Wheat
            : e.event_type === "rebellion" ? AlertTriangle
            : Scroll,
          category: e.event_type === "trade_raid" ? "Přepadení" : e.event_type,
          text: e.note || e.event_type,
          tone: isCritical ? "danger" : e.event_type === "trade_raid" ? "warning" : "info",
        });
      }

      // Rumors (max 5 to keep it concise)
      for (const r of (rumors || []).slice(0, 5)) {
        result.push({
          icon: MessageSquare,
          category: `Zvěst · ${r.city_name}`,
          text: r.text,
          tone: r.tone_tag === "alarming" ? "warning" : "info",
        });
      }

      setItems(result);
      setLoading(false);
    };

    load();
  }, [sessionId, lastTurn]);

  if (loading) return null;
  if (items.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        V roce {lastTurn} se neodehrálo nic zásadního.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-2 p-1">
        <p className="text-xs text-muted-foreground font-display uppercase tracking-wider mb-3">
          Souhrn roku {lastTurn}
        </p>
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${toneBg[item.tone]}`}>
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${toneColors[item.tone]}`} />
              <div className="min-w-0">
                <Badge variant="outline" className="text-[10px] font-normal mb-1">{item.category}</Badge>
                <p className="text-sm text-foreground/90 leading-snug">{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};

export { TurnReportPanel };
export type { TurnReportItem };
