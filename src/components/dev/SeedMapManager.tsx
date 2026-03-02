import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Map, Wand2, BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

interface MapStats {
  total_hexes: number;
  grid_bounds: { minQ: number; maxQ: number; minR: number; maxR: number };
  biome_counts: Record<string, number>;
  blocked_ratio: number;
  coastal_count: number;
}

interface PatchResult {
  patch: {
    intent: string;
    changes: { op: string; q: number; r: number; fields: Record<string, any> }[];
    notes: string;
    validation_expectations: string;
  };
  applied: boolean;
  applied_count: number;
  errors?: string[];
}

const BIOME_EMOJI: Record<string, string> = {
  sea: "🌊", plains: "🌾", forest: "🌲", hills: "⛰",
  mountains: "🏔", desert: "🏜", swamp: "🌿", tundra: "❄",
};

const PRESET_REQUESTS = [
  "Přidej horský hřeben oddělující sever a jih mapy",
  "Vytvoř pobřežní pás na západní straně",
  "Přidej velký les do středu mapy",
  "Přeměň izolované púštní hexy na pláně pro lepší koherenci",
  "Vytvoř úzký průsmyk (chokepoint) mezi dvěma horskými masivy",
  "Přidej bažinatou oblast podél řeky ve středu",
];

const SeedMapManager = ({ sessionId, onRefetch }: Props) => {
  const [stats, setStats] = useState<MapStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [request, setRequest] = useState("");
  const [patching, setPatching] = useState(false);
  const [history, setHistory] = useState<{ request: string; result: PatchResult; timestamp: string }[]>([]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase
        .from("province_hexes")
        .select("q, r, biome_family, mean_height, coastal")
        .eq("session_id", sessionId)
        .limit(5000);

      if (error) throw error;
      if (!data?.length) {
        toast.error("Žádné hexy nenalezeny");
        setLoadingStats(false);
        return;
      }

      const biomeCounts: Record<string, number> = {};
      let blockedCount = 0;
      let coastalCount = 0;
      let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;

      for (const h of data) {
        biomeCounts[h.biome_family] = (biomeCounts[h.biome_family] || 0) + 1;
        if (h.biome_family === "sea" || h.biome_family === "mountains") blockedCount++;
        if (h.coastal) coastalCount++;
        if (h.q < minQ) minQ = h.q;
        if (h.q > maxQ) maxQ = h.q;
        if (h.r < minR) minR = h.r;
        if (h.r > maxR) maxR = h.r;
      }

      setStats({
        total_hexes: data.length,
        grid_bounds: { minQ, maxQ, minR, maxR },
        biome_counts: biomeCounts,
        blocked_ratio: blockedCount / data.length,
        coastal_count: coastalCount,
      });
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "unknown"));
    }
    setLoadingStats(false);
  }, [sessionId]);

  const runPatch = useCallback(async (userRequest: string) => {
    if (!userRequest.trim()) return;
    setPatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("seedmap-patch", {
        body: { session_id: sessionId, user_request: userRequest },
      });
      if (error) throw error;

      const result = data as PatchResult;
      setHistory(prev => [{
        request: userRequest,
        result,
        timestamp: new Date().toLocaleTimeString("cs"),
      }, ...prev.slice(0, 9)]);

      toast.success(`Patch aplikován: ${result.applied_count} změn`);
      setRequest("");
      // Refresh stats
      loadStats();
      onRefetch?.();
    } catch (e: any) {
      toast.error("Patch selhal: " + (e.message || "unknown"));
    }
    setPatching(false);
  }, [sessionId, loadStats, onRefetch]);

  return (
    <div className="space-y-4">
      {/* Map Stats */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Stav mapy
            <Button size="sm" variant="ghost" onClick={loadStats} disabled={loadingStats} className="ml-auto h-7 gap-1">
              {loadingStats ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Načíst
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{stats.total_hexes} hexů</Badge>
                <Badge variant="outline" className="text-xs">
                  Q: [{stats.grid_bounds.minQ}, {stats.grid_bounds.maxQ}]
                </Badge>
                <Badge variant="outline" className="text-xs">
                  R: [{stats.grid_bounds.minR}, {stats.grid_bounds.maxR}]
                </Badge>
                <Badge variant="outline" className="text-xs">
                  🌊 Pobřeží: {stats.coastal_count}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Blokace: {(stats.blocked_ratio * 100).toFixed(1)}%
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(stats.biome_counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([biome, count]) => (
                    <div key={biome} className="flex items-center gap-1 text-xs bg-muted/40 rounded px-2 py-1">
                      <span>{BIOME_EMOJI[biome] || "?"}</span>
                      <span className="capitalize truncate">{biome}</span>
                      <span className="font-mono ml-auto text-muted-foreground">{count}</span>
                      <span className="text-muted-foreground text-[10px]">
                        ({((count / stats.total_hexes) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Klikni "Načíst" pro zobrazení statistik mapy</p>
          )}
        </CardContent>
      </Card>

      {/* AI Patch Request */}
      <Card className="border-accent/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-accent-foreground" />
            AI Map Patch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Popiš, co chceš na mapě změnit... (max 80 tile editů)"
            className="min-h-[60px] text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {PRESET_REQUESTS.map((preset, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                className="text-[10px] h-6 px-2"
                onClick={() => setRequest(preset)}
              >
                {preset.length > 40 ? preset.slice(0, 38) + "…" : preset}
              </Button>
            ))}
          </div>
          <Button
            onClick={() => runPatch(request)}
            disabled={patching || !request.trim()}
            className="w-full gap-2"
          >
            {patching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Map className="h-4 w-4" />}
            {patching ? "Generuji patch…" : "Aplikovat AI Patch"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historie patchů</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="border rounded p-2 space-y-1 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{h.timestamp}</Badge>
                      <span className="text-xs font-medium truncate">{h.request}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground italic">{h.result.patch.intent}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {h.result.applied_count} změn
                      </Badge>
                      {h.result.errors?.length ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {h.result.errors.length} chyb
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{h.result.patch.notes}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SeedMapManager;
