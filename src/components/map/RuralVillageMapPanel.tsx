import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HousePlus, Loader2, ArrowUpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RURAL_SETTLEMENT_COST,
  RURAL_SETTLEMENT_MAX_LEVEL,
  RURAL_SETTLEMENT_UPGRADE_COST,
  RURAL_SETTLEMENT_REACH,
  ruralSettlementReason,
  sanitizeVillageName,
  villageFootpathFactor,
} from "../../../supabase/functions/_shared/ruralSettlement";
import { FOOTPATH_FACTOR } from "../../../supabase/functions/_shared/ruralSites";

type Parcel = { id: string; grid_x: number; grid_y: number; city_id: string | null; owner_player: string | null; claim_kind: string | null };
type Village = { id: string; name: string; level: number; parcel_id: string; owner_player: string; grid_x: number; grid_y: number; city_id: string };

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
  parcel: Parcel;
  onChanged?: () => void;
}

/** Map parcel action. All prices, eligibility and payments are rechecked by the SQL RPC. */
export default function RuralVillageMapPanel({ sessionId, playerName, currentTurn, parcel, onChanged }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cellKey = [sessionId, parcel.grid_x, parcel.grid_y];
  const villagesKey = ["map-rural-villages", ...cellKey];
  const { data: villages, error: villagesError, isLoading: villagesLoading } = useQuery({
    queryKey: villagesKey,
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("rural_settlements")
        .select("id, name, level, parcel_id, owner_player, grid_x, grid_y, city_id")
        .eq("session_id", sessionId).eq("grid_x", parcel.grid_x).eq("grid_y", parcel.grid_y);
      if (error) throw error;
      return (data || []) as Village[];
    },
  });
  const { data: city, error: cityError, isLoading: cityLoading } = useQuery({
    queryKey: ["map-rural-village-city", sessionId, parcel.city_id],
    enabled: !!sessionId && !!parcel.city_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("cities")
        .select("id, owner_player, grid_x, grid_y")
        .eq("session_id", sessionId).eq("id", parcel.city_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const village = villages?.[0] ?? null;
  const blocked = villagesLoading || cityLoading || villagesError || cityError;
  const reason = blocked
    ? "Ověřuji dostupnost parcel a vesnic."
    : ruralSettlementReason({
        player: playerName,
        parcel,
        city: city ? { id: city.id, owner_player: city.owner_player, grid_x: city.grid_x, grid_y: city.grid_y } : null,
        name: sanitizeVillageName(name),
        villageInCell: !!village,
        villageOnParcel: !!village && village.parcel_id === parcel.id,
      });

  const run = async (commandType: string, commandPayload: Record<string, unknown>) => {
    if (busy || currentTurn == null || currentTurn < 1 || blocked) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await dispatchCommand({
        sessionId, turnNumber: currentTurn, actor: { name: playerName },
        commandType, commandPayload,
      });
      if (!result?.ok || result.error) {
        setMessage(result?.error || "Server příkaz odmítl.");
        return;
      }
      setMessage(commandType === "CREATE_RURAL_SETTLEMENT" ? "Vesnice založena." : "Vesnice povýšena.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: villagesKey }),
        qc.invalidateQueries({ queryKey: ["rural_settlements", sessionId] }),
      ]);
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Spojení se serverem selhalo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border/80 bg-background/60 p-3 text-xs" aria-label="Vesnice na mapě">
      <div className="flex items-center gap-2 font-semibold">
        <HousePlus className="h-4 w-4" /> Vesnice na tomto makropoli
      </div>
      {villagesError ? (
        <p role="alert" className="text-destructive">Vesnice nelze načíst. Založení vyžaduje databázovou migraci; žádná platba neproběhla.</p>
      ) : village ? (
        <div className="space-y-2">
          <p><strong>{village.name}</strong> · úroveň {village.level}/3
            {village.owner_player !== playerName ? " · cizí vlastník" : ""}
          </p>
          <p className="text-muted-foreground">
            Odvoz po stezce: {Math.round(FOOTPATH_FACTOR * 100)} % → {Math.round(villageFootpathFactor(FOOTPATH_FACTOR, village.level) * 100)} %.
            Dokončená cesta zůstává 100 %, pole bez spojení 0 %.
          </p>
          {village.owner_player === playerName && village.level < RURAL_SETTLEMENT_MAX_LEVEL && (
            <Button size="sm" variant="outline" className="w-full" disabled={busy || currentTurn == null}
              onClick={() => void run("UPGRADE_RURAL_SETTLEMENT", {
                settlementId: village.id, targetLevel: village.level + 1,
              })}>
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowUpCircle className="mr-1 h-3 w-3" />}
              Povýšit na {village.level + 1} · {RURAL_SETTLEMENT_UPGRADE_COST[village.level + 1]} zlata
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            Založení za {RURAL_SETTLEMENT_COST} zlata na vlastní využívané parcele do {RURAL_SETTLEMENT_REACH} makropolí od města.
            Vesnice nevytváří nové obyvatele ani peníze.
          </p>
          <Input className="h-8 text-xs" aria-label="Název vesnice" placeholder="Název vesnice" maxLength={40}
            value={name} onChange={e => setName(e.target.value)} disabled={busy} />
          <Button size="sm" className="w-full" disabled={busy || !!reason || currentTurn == null}
            onClick={() => void run("CREATE_RURAL_SETTLEMENT", { parcelId: parcel.id, name: sanitizeVillageName(name) })}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <HousePlus className="mr-1 h-3 w-3" />}
            Založit vesnici · {RURAL_SETTLEMENT_COST} zlata
          </Button>
          {reason && <p className="text-muted-foreground">{reason}</p>}
        </div>
      )}
      {message && <p role="status" className={message.includes("založena") || message.includes("povýšena") ? "text-emerald-500" : "text-destructive"}>{message}</p>}
    </section>
  );
}
