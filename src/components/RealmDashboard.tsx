import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { migrateLegacyMilitary } from "@/lib/turnEngine";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Crown, Code } from "lucide-react";
import { toast } from "sonner";
import RealmIndicators from "@/components/realm/RealmIndicators";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";
import { RealmHeritageBadge } from "@/components/realm/RealmHeritageBadge";
import { HeritageEffectsPanel } from "@/components/realm/HeritageEffectsPanel";
import { RouteStatePanel } from "@/components/realm/RouteStatePanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  cities: any[];
  realm?: any;
  onRefetch: () => void;
}

const RealmDashboard = ({ sessionId, currentPlayerName, currentTurn, myRole, cities, realm, onRefetch }: Props) => {
  const [processing, setProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

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
        const s = data?.summary;
        const famineNote = s?.famineCities > 0 ? ` | ⚠️ ${s.famineCities} měst hladoví` : "";
        const tollNote = s?.tollsPaid > 0 ? ` | 🏛️ Mýtné: -${s.tollsPaid}` : "";
        const evtNote = s?.eventsGenerated > 0 ? ` | 📜 ${s.eventsGenerated} událostí` : "";
        toast.success(`Kolo ${currentTurn} zpracováno`, {
          description: `⚒️ ${s?.totalProduction?.toFixed(0) || 0} | 💰 ${s?.totalWealth?.toFixed(0) || 0} | 🏛️ ${s?.totalCapacity?.toFixed(0) || 0} | Rezerva: ${s?.grainReserve || 0}/${s?.granaryCapacity || 0}${famineNote}${tollNote}${evtNote}`,
        });
      }
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
    onRefetch();
  };

  if (!realm) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header + Process Turn (admin/moderator only — players use canonical commit-turn flow) */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-illuminated" />
          Přehled říše
        </h3>
        {(myRole === "admin" || myRole === "moderator") && (
          <Button onClick={handleProcessTurn} disabled={processing} size="sm" variant="outline" className="font-display text-xs">
            {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            Zpracovat kolo (dev)
          </Button>
        )}
      </div>

      {/* Pradávný odkaz (v9.1) */}
      <RealmHeritageBadge sessionId={sessionId} playerName={currentPlayerName} />
      <HeritageEffectsPanel sessionId={sessionId} playerName={currentPlayerName} />

      {/* Key Indicators */}
      <RealmIndicators realm={realm} cities={myCities} currentTurn={currentTurn} />

      {/* Stav obchodních tras (v9.1 PR-D) */}
      <RouteStatePanel sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />

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
