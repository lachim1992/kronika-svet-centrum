/**
 * ManpowerHUDCard — Stage 8 overlay
 *
 * Floating card on WorldMap showing live manpower ledger:
 *   pool / mobilized / available + over_mobilized warning + upkeep totals.
 *
 * Reads canonical realm_resources (no derivation client-side).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Swords, AlertTriangle, Coins, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  sessionId: string;
  playerName: string;
}

interface RealmRow {
  manpower_pool: number | null;
  manpower_mobilized: number | null;
  manpower_available: number | null;
  over_mobilized: boolean | null;
  military_gold_upkeep: number | null;
  military_food_upkeep: number | null;
}

export default function ManpowerHUDCard({ sessionId, playerName }: Props) {
  const [realm, setRealm] = useState<RealmRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("realm_resources")
        .select("manpower_pool, manpower_mobilized, manpower_available, over_mobilized, military_gold_upkeep, military_food_upkeep")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle();
      if (!cancelled) setRealm(data as RealmRow | null);
    };
    load();
    const ch = supabase
      .channel(`manpower-hud-${sessionId}-${playerName}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "realm_resources", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.player_name === playerName) setRealm(row as RealmRow);
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sessionId, playerName]);

  if (!realm) return null;

  const pool = realm.manpower_pool || 0;
  const mobilized = realm.manpower_mobilized || 0;
  const available = realm.manpower_available ?? Math.max(0, pool - mobilized);
  const over = realm.over_mobilized === true;
  const goldUp = Math.round(Number(realm.military_gold_upkeep || 0));
  const foodUp = Math.round(Number(realm.military_food_upkeep || 0));

  return (
    <div className="absolute top-2 right-2 z-30 pointer-events-auto">
      <div className="rounded-lg bg-card/90 backdrop-blur-md border border-border shadow-lg px-3 py-2 min-w-[180px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-display font-bold tracking-wider uppercase text-muted-foreground">
            Manpower
          </span>
          {over && (
            <Badge variant="destructive" className="h-4 text-[9px] gap-0.5 px-1">
              <AlertTriangle className="h-2.5 w-2.5" />Over-mob
            </Badge>
          )}
        </div>
        <div className="space-y-0.5 text-xs font-mono">
          <Row icon={<Users className="h-3 w-3 text-primary" />} label="Pool" value={pool} />
          <Row icon={<Swords className="h-3 w-3 text-destructive" />} label="Nasazeno" value={mobilized} accent={over ? "text-destructive" : ""} />
          <Row icon={<Users className="h-3 w-3 text-emerald-500" />} label="Volných" value={available} />
        </div>
        {(goldUp > 0 || foodUp > 0) && (
          <div className="mt-1.5 pt-1.5 border-t border-border/60 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Coins className="h-2.5 w-2.5" />{goldUp}</span>
            <span className="flex items-center gap-0.5"><Wheat className="h-2.5 w-2.5" />{foodUp}</span>
            <span className="opacity-70">/kolo</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value, accent = "" }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}{label}
      </span>
      <span className={`font-semibold ${accent}`}>{value.toLocaleString()}</span>
    </div>
  );
}
