import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRealmResources, migrateLegacyMilitary } from "@/lib/turnEngine";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Crown, Code } from "lucide-react";
import { toast } from "sonner";
import RealmIndicators from "@/components/realm/RealmIndicators";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  cities: any[];
  onRefetch: () => void;
}

const RealmDashboard = ({ sessionId, currentPlayerName, currentTurn, myRole, cities, onRefetch }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("realm_resources").select("*")
      .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle();
    if (data) setRealm(data);
    else {
      const r = await ensureRealmResources(sessionId, currentPlayerName);
      setRealm(r);
    }
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProcessTurn = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-turn", {
        body: { sessionId, playerName: currentPlayerName },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast.info(`Kolo ${currentTurn} již bylo zpracováno`);
      } else {
        const le = data?.summary?.lawEffects;
        const lawInfo = le && (le.taxRateModifier || le.grainRationModifier || le.tradeRestriction)
          ? ` | Zákony: ${le.taxRateModifier ? `daně ${le.taxRateModifier > 0 ? "+" : ""}${le.taxRateModifier}%` : ""}${le.grainRationModifier ? ` příděl ${le.grainRationModifier > 0 ? "+" : ""}${le.grainRationModifier}%` : ""}${le.tradeRestriction ? ` obchod −${le.tradeRestriction}%` : ""}` : "";
        toast.success(`Kolo ${currentTurn} zpracováno`, {
          description: `Obilí: ${data?.summary?.netGrain >= 0 ? "+" : ""}${data?.summary?.netGrain}, Zásoby: ${data?.summary?.grainReserve}/${data?.summary?.granaryCapacity}${lawInfo}`,
        });
      }
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba zpracování kola", { description: e.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleMigrateLegacy = async () => {
    const res = await migrateLegacyMilitary(sessionId);
    toast.success(`Migrace dokončena: ${res.migrated} jednotek`);
    await fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header + Process Turn */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-illuminated" />
          Přehled říše
        </h3>
        <Button onClick={handleProcessTurn} disabled={processing} size="sm" className="font-display">
          {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          Zpracovat kolo
        </Button>
      </div>

      {/* Key Indicators */}
      <RealmIndicators realm={realm} cities={myCities} currentTurn={currentTurn} />

      {/* Laws & Decrees */}
      <RealmLawsDecrees sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />

      {/* Legacy migration (admin only) */}
      {(myRole === "admin" || myRole === "moderator") && (
        <Button variant="outline" size="sm" onClick={handleMigrateLegacy} className="text-xs">
          Migrovat starý vojenský systém
        </Button>
      )}

      {/* Debug toggle */}
      {(myRole === "admin" || myRole === "moderator") && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowDebug(!showDebug)} className="text-xs gap-1">
            <Code className="h-3 w-3" />{showDebug ? "Skrýt" : "Debug"} realm_resources
          </Button>
          {showDebug && realm && (
            <pre className="mt-2 p-3 rounded bg-muted text-[10px] overflow-auto max-h-60 border border-border">
              {JSON.stringify(realm, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default RealmDashboard;
