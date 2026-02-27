import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRealmResources, migrateLegacyMilitary } from "@/lib/turnEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Play, Crown, Gauge, Skull, Code
} from "lucide-react";
import { toast } from "sonner";

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
    const { data } = await supabase
      .from("realm_resources").select("*")
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
        toast.success(`Kolo ${currentTurn} zpracováno`, {
          description: `Obilí: ${data?.summary?.netGrain >= 0 ? "+" : ""}${data?.summary?.netGrain}, Zásoby: ${data?.summary?.grainReserve}/${data?.summary?.granaryCapacity}`,
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

  const handleMobilizationChange = async (val: number[]) => {
    if (!realm) return;
    const rate = val[0] / 100;
    await supabase.from("realm_resources").update({ mobilization_rate: rate }).eq("id", realm.id);
    setRealm({ ...realm, mobilization_rate: rate });
  };

  const handleMigrateLegacy = async () => {
    const res = await migrateLegacyMilitary(sessionId);
    toast.success(`Migrace dokončena: ${res.migrated} jednotek`);
    await fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const famineCities = myCities.filter(c => c.famine_turn);
  const availableManpower = (realm?.manpower_pool || 0) - (realm?.manpower_committed || 0);
  const netGrain = realm?.last_turn_grain_net ?? 0;

  return (
    <div className="space-y-4">
      {/* Process Turn */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-illuminated" />
          Ekonomický přehled
        </h3>
        <Button onClick={handleProcessTurn} disabled={processing} size="sm" className="font-display">
          {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          Zpracovat kolo
        </Button>
      </div>

      {/* Famine alerts */}
      {famineCities.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Skull className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-destructive">Hladomor!</span>
            </div>
            {famineCities.map(c => (
              <div key={c.id} className="text-xs text-destructive">
                {c.name} — deficit {c.famine_severity}, stabilita {c.city_stability}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grain summary */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Produkce obilí</span><span className="font-semibold">{realm?.last_turn_grain_prod || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Spotřeba obilí</span><span className="font-semibold">{realm?.last_turn_grain_cons || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bilance</span><span className={`font-semibold ${netGrain < 0 ? "text-destructive" : "text-accent"}`}>{netGrain >= 0 ? "+" : ""}{netGrain}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Zásoby</span><span className="font-semibold">{realm?.grain_reserve || 0} / {realm?.granary_capacity || 500}</span></div>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${Math.min(100, ((realm?.grain_reserve || 0) / Math.max(1, realm?.granary_capacity || 500)) * 100)}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Mobilization */}
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Gauge className="h-3 w-3" />Mobilizace ({Math.round((realm?.mobilization_rate || 0.1) * 100)}%)</CardTitle></CardHeader>
        <CardContent className="p-3 pt-2">
          <Slider
            value={[Math.round((realm?.mobilization_rate || 0.1) * 100)]}
            onValueCommit={handleMobilizationChange}
            max={50} min={0} step={1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0% — Mír</span>
            <span>30% — Soft cap</span>
            <span>50% — Hard cap</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <div><span className="text-muted-foreground">K dispozici:</span> <strong>{availableManpower}</strong></div>
            <div><span className="text-muted-foreground">Odvedení:</span> <strong>{realm?.manpower_committed || 0}</strong></div>
            <div><span className="text-muted-foreground">Logistika:</span> <strong>{realm?.logistic_capacity || 0}</strong></div>
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">Suroviny</CardTitle></CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { label: "Dřevo", val: realm?.wood_reserve },
              { label: "Kámen", val: realm?.stone_reserve },
              { label: "Železo", val: realm?.iron_reserve },
              { label: "Koně", val: `${realm?.horses_reserve || 0}/${realm?.stables_capacity || 100}` },
              { label: "Zlato", val: realm?.gold_reserve },
              { label: "Stabilita", val: realm?.stability },
            ].map(r => (
              <div key={r.label} className="flex justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-bold">{r.val ?? 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legacy migration (admin only) */}
      {(myRole === "admin" || myRole === "moderator") && (
        <Button variant="outline" size="sm" onClick={handleMigrateLegacy} className="text-xs">
          Migrovat starý vojenský systém
        </Button>
      )}

      {/* Debug toggle (dev only) */}
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
