// RealmHeritageBadge — zobrazí pradávné rody hráče (v9.1).
//
// Načítá realm_heritage pro (sessionId, playerName) a renderuje badge řadu.
// Použijte v EmpireOverview, RealmDashboard nebo HomeTab.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";

interface HeritageRow {
  id: string;
  lineage_id: string;
  lineage_name: string;
  cultural_anchor: string | null;
  description: string | null;
}

interface Props {
  sessionId: string;
  playerName: string;
  className?: string;
}

export const RealmHeritageBadge = ({ sessionId, playerName, className }: Props) => {
  const [rows, setRows] = useState<HeritageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("realm_heritage" as any)
        .select("id, lineage_id, lineage_name, cultural_anchor, description")
        .eq("session_id", sessionId)
        .eq("player_name", playerName);
      if (!cancelled) {
        setRows(((data ?? []) as unknown) as HeritageRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, playerName]);

  if (loading || rows.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span className="font-semibold">Náš pradávný odkaz</span>
      </div>
      <TooltipProvider>
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <Tooltip key={r.id}>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="cursor-help text-xs">
                  {r.lineage_name}
                  {r.cultural_anchor && (
                    <span className="ml-1 text-[10px] opacity-60 font-mono">
                      · {r.cultural_anchor}
                    </span>
                  )}
                </Badge>
              </TooltipTrigger>
              {r.description && (
                <TooltipContent className="max-w-xs text-xs">
                  {r.description}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
};
