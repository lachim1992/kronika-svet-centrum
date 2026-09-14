import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { migrateLegacyMilitary } from "@/lib/turnEngine";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Crown, Code } from "lucide-react";
import { toast } from "sonner";
import RealmIndicators from "@/components/realm/RealmIndicators";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";
import { RealmHeritageBadge } from "@/components/realm/RealmHeritageBadge";
import { HeritageEffectsPanel } from "@/components/realm/HeritageEffectsPanel";
import { RouteStatePanel } from "@/components/realm/RouteStatePanel";
import TurnExecutionReport from "@/components/realm/TurnExecutionReport";

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

  const handleRefreshEconomy = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(data?.warnings?.join("; ") || "Přepočet ekonomiky selhal");
      toast.success("Ekonomika přepočtena");
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba přepočtu ekonomiky", { description: e.message });
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
      {/* Projection refresh only — advancing time belongs to commit-turn */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-illuminated" />
          Přehled říše
        </h3>
        {(myRole === "admin" || myRole === "moderator") && (
          <Button onClick={handleRefreshEconomy} disabled={processing} size="sm" variant="outline" className="font-display text-xs">
            {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Přepočítat ekonomiku
          </Button>
        )}
      </div>

      {/* Report posledního commit-turn (chyby AI frakcí, process-turn, fáze) */}
      <TurnExecutionReport sessionId={sessionId} />

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
