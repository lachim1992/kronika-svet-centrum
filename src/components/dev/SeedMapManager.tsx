import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Map, Wand2, BarChart3, RefreshCw, Trash2, Sparkles,
  ThumbsUp, ThumbsDown, Settings, Eye, GraduationCap, Star, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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
  land_ratio: number;
}

interface HexPreviewData {
  q: number; r: number; biome_family: string; coastal: boolean; mean_height: number;
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

interface GenSettings {
  width: number;
  height: number;
  targetLandRatio: number;
  continentCount: number;
  mountainDensity: number;
  coastalRichness: number;
  biomeWeights: Record<string, number>;
}

const DEFAULT_SETTINGS: GenSettings = {
  width: 31, height: 31,
  targetLandRatio: 0.55,
  continentCount: 3,
  mountainDensity: 0.5,
  coastalRichness: 0.5,
  biomeWeights: { plains: 1, forest: 1, hills: 1, desert: 0.5, swamp: 0.3, tundra: 0.4 },
};

const BIOME_COLORS: Record<string, string> = {
  sea: "#2563eb", plains: "#a3b860", forest: "#2d6a1e", hills: "#8b7355",
  mountains: "#6b6b6b", desert: "#d4a843", swamp: "#4a6741", tundra: "#b8ccd4",
};

const BIOME_EMOJI: Record<string, string> = {
  sea: "🌊", plains: "🌾", forest: "🌲", hills: "⛰",
  mountains: "🏔", desert: "🏜", swamp: "🌿", tundra: "❄",
};

const ASPECT_LABELS: Record<string, string> = {
  coastlines: "Pobřežní linie", mountain_ridges: "Horské hřebeny",
  biome_diversity: "Diverzita biomů", chokepoints: "Strategické průsmyky",
  start_balance: "Vyvážené starty", continent_shape: "Tvar kontinentů",
  river_valleys: "Říční údolí", island_chains: "Ostrovy",
};

const PRESET_REQUESTS = [
  "Přidej horský hřeben oddělující sever a jih",
  "Vytvoř pobřežní pás na západní straně",
  "Přidej velký les do středu mapy",
  "Vytvoř úzký průsmyk mezi horskými masivy",
  "Vybalancuj startovní pozice",
  "Přidej vnitrozemské moře nebo velký záliv",
];

// ── Mini Hex Preview Component (axial coordinates) ──
const HexPreview = ({ hexes, bounds }: {
  hexes: HexPreviewData[];
  bounds: { minQ: number; maxQ: number; minR: number; maxR: number };
}) => {
  const cellSize = 6;

  const hexMap = useMemo(() => {
    const m = new window.Map<string, HexPreviewData>();
    for (const h of hexes) m.set(`${h.q},${h.r}`, h);
    return m;
  }, [hexes]);

  // Compute pixel bounds using axial→pixel: px = q + r*0.5, py = r*0.866
  const allPixels = hexes.map(h => ({
    px: (h.q + h.r * 0.5) * cellSize,
    py: h.r * 0.866 * cellSize,
  }));
  const minPx = Math.min(...allPixels.map(p => p.px));
  const maxPx = Math.max(...allPixels.map(p => p.px));
  const minPy = Math.min(...allPixels.map(p => p.py));
  const maxPy = Math.max(...allPixels.map(p => p.py));
  const canvasW = maxPx - minPx + cellSize + 10;
  const canvasH = maxPy - minPy + cellSize + 10;

  return (
    <div
      className="border rounded bg-background overflow-hidden mx-auto"
      style={{ width: canvasW, height: canvasH, position: "relative" }}
    >
      {hexes.map(hex => {
        const px = (hex.q + hex.r * 0.5) * cellSize - minPx + 4;
        const py = hex.r * 0.866 * cellSize - minPy + 4;
        return (
          <div
            key={`${hex.q},${hex.r}`}
            className="absolute"
            style={{
              left: px,
              top: py,
              width: cellSize - 1,
              height: cellSize - 1,
              backgroundColor: BIOME_COLORS[hex.biome_family] || "#999",
              borderRadius: 1,
              opacity: hex.coastal ? 1 : 0.85,
              border: hex.coastal ? "1px solid rgba(255,255,255,0.4)" : "none",
            }}
            title={`[${hex.q},${hex.r}] ${hex.biome_family} h:${hex.mean_height}`}
          />
        );
      })}
    </div>
  );
};

// ── Rating Stars ──
const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map(s => (
      <button key={s} onClick={() => onChange(s)} className="hover:scale-110 transition-transform">
        <Star className={`h-5 w-5 ${s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
      </button>
    ))}
  </div>
);

// ── Main Component ──
const SeedMapManager = ({ sessionId, onRefetch }: Props) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<MapStats | null>(null);
  const [hexPreview, setHexPreview] = useState<HexPreviewData[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [request, setRequest] = useState("");
  const [patching, setPatching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<{ request: string; result: PatchResult; timestamp: string; rated?: number }[]>([]);

  // Learning state
  const [rating, setRating] = useState(0);
  const [likedAspects, setLikedAspects] = useState<string[]>([]);
  const [dislikedAspects, setDislikedAspects] = useState<string[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [learnedPrefs, setLearnedPrefs] = useState<{ style_notes: string[]; avg_rating: number; total_ratings: number } | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  // Load map dimensions from world_foundations + user preferences on mount
  useEffect(() => {
    // Load actual map dimensions from world_foundations
    supabase
      .from("world_foundations")
      .select("map_width, map_height")
      .eq("session_id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const w = (data as any).map_width;
          const h = (data as any).map_height;
          if (w && h) {
            setSettings(prev => ({ ...prev, width: w, height: h }));
          }
        }
      });

    if (!user?.id) return;
    supabase
      .from("map_gen_preferences")
      .select("preferred_land_ratio, preferred_biome_weights, preferred_continent_count, preferred_mountain_density, preferred_coastal_richness, style_notes, avg_rating, total_ratings")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings(prev => ({
            ...prev,
            targetLandRatio: Number(data.preferred_land_ratio) || prev.targetLandRatio,
            continentCount: data.preferred_continent_count || prev.continentCount,
            mountainDensity: Number(data.preferred_mountain_density) || prev.mountainDensity,
            coastalRichness: Number(data.preferred_coastal_richness) || prev.coastalRichness,
            biomeWeights: (data.preferred_biome_weights as Record<string, number>) || prev.biomeWeights,
          }));
          setLearnedPrefs({
            style_notes: (data.style_notes as string[]) || [],
            avg_rating: Number(data.avg_rating) || 0,
            total_ratings: data.total_ratings || 0,
          });
        }
      });
  }, [user?.id, sessionId]);

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

      setHexPreview(data as HexPreviewData[]);

      const biomeCounts: Record<string, number> = {};
      let blockedCount = 0, coastalCount = 0, landCount = 0;
      let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;

      for (const h of data) {
        biomeCounts[h.biome_family] = (biomeCounts[h.biome_family] || 0) + 1;
        if (h.biome_family === "sea" || h.biome_family === "mountains") blockedCount++;
        if (h.biome_family !== "sea") landCount++;
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
        land_ratio: landCount / data.length,
      });
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "unknown"));
    }
    setLoadingStats(false);
  }, [sessionId]);

  const regenerateMap = useCallback(async () => {
    setRegenerating(true);
    try {
      const { error: delErr } = await supabase
        .from("province_hexes")
        .delete()
        .eq("session_id", sessionId);
      if (delErr) throw delErr;

      const { error: seedErr } = await supabase
        .from("game_sessions")
        .update({ world_seed: crypto.randomUUID() })
        .eq("id", sessionId);
      if (seedErr) throw seedErr;

      // Sync dimensions to world_foundations
      await supabase
        .from("world_foundations")
        .update({ map_width: settings.width, map_height: settings.height } as any)
        .eq("session_id", sessionId);

      const { data, error } = await supabase.functions.invoke("generate-world-map", {
        body: { session_id: sessionId, width: settings.width, height: settings.height },
      });
      if (error) throw error;

      toast.success(`Mapa vygenerována: ${data.hexCount} hexů`);
      setHistory([]);
      loadStats();
      onRefetch?.();
    } catch (e: any) {
      toast.error("Regenerace selhala: " + (e.message || "unknown"));
    }
    setRegenerating(false);
  }, [sessionId, settings.width, settings.height, loadStats, onRefetch]);

  const runPatch = useCallback(async (userRequest: string) => {
    if (!userRequest.trim()) return;
    setPatching(true);
    try {
      // Include learned preferences in patch context
      let augmentedRequest = userRequest;
      if (learnedPrefs?.style_notes?.length) {
        augmentedRequest += `\n\n[Learned user preferences from previous feedback: ${learnedPrefs.style_notes.slice(-5).join("; ")}]`;
      }

      const { data, error } = await supabase.functions.invoke("seedmap-patch", {
        body: { session_id: sessionId, user_request: augmentedRequest },
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
      loadStats();
      onRefetch?.();
    } catch (e: any) {
      toast.error("Patch selhal: " + (e.message || "unknown"));
    }
    setPatching(false);
  }, [sessionId, loadStats, onRefetch, learnedPrefs]);

  const runStrategicPass = useCallback(async () => {
    let prompt = `Analyze and improve this map for strategic quality:
1. Ensure 2-3 natural chokepoints (mountain passes, land bridges)
2. Smooth biome transitions (no desert next to forest)
3. At least 30% plains for settlements
4. Create inland sea or large bay for naval gameplay`;
    if (learnedPrefs?.style_notes?.length) {
      prompt += `\n\nUser's learned style preferences: ${learnedPrefs.style_notes.slice(-5).join("; ")}`;
    }
    await runPatch(prompt);
  }, [runPatch, learnedPrefs]);

  // ── Feedback / Learning ──
  const toggleAspect = (aspect: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(aspect) ? list.filter(a => a !== aspect) : [...list, aspect]);
  };

  const submitFeedback = useCallback(async () => {
    if (!user?.id || rating === 0) {
      toast.error("Vyber hodnocení hvězdami");
      return;
    }
    setSavingFeedback(true);
    try {
      // Save feedback
      await supabase.from("map_gen_feedback").insert([{
        session_id: sessionId,
        user_id: user.id,
        feedback_type: "rating",
        rating,
        liked_aspects: likedAspects,
        disliked_aspects: dislikedAspects,
        notes: feedbackNote || null,
        map_snapshot: stats ? { biome_counts: stats.biome_counts, land_ratio: stats.land_ratio, settings } as any : null,
      }]);

      // Update / create learned preferences
      const styleNotes: string[] = [];
      if (likedAspects.length) styleNotes.push(`Likes: ${likedAspects.map(a => ASPECT_LABELS[a] || a).join(", ")}`);
      if (dislikedAspects.length) styleNotes.push(`Dislikes: ${dislikedAspects.map(a => ASPECT_LABELS[a] || a).join(", ")}`);
      if (feedbackNote) styleNotes.push(`Note: ${feedbackNote}`);
      if (rating >= 4) styleNotes.push(`High-rated map had land_ratio=${stats?.land_ratio?.toFixed(2)}, biomes=${Object.keys(stats?.biome_counts || {}).join(",")}`);

      const existing = learnedPrefs;
      const newTotal = (existing?.total_ratings || 0) + 1;
      const newAvg = ((existing?.avg_rating || 0) * (existing?.total_ratings || 0) + rating) / newTotal;
      const allNotes = [...(existing?.style_notes || []), ...styleNotes].slice(-20); // keep last 20

      const { error } = await supabase.from("map_gen_preferences").upsert({
        user_id: user.id,
        preferred_land_ratio: settings.targetLandRatio,
        preferred_biome_weights: settings.biomeWeights,
        preferred_continent_count: settings.continentCount,
        preferred_mountain_density: settings.mountainDensity,
        preferred_coastal_richness: settings.coastalRichness,
        style_notes: allNotes,
        total_ratings: newTotal,
        avg_rating: Math.round(newAvg * 100) / 100,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      if (error) throw error;

      setLearnedPrefs({ style_notes: allNotes, avg_rating: newAvg, total_ratings: newTotal });
      toast.success("Zpětná vazba uložena — budu se učit! 🧠");
      setRating(0);
      setLikedAspects([]);
      setDislikedAspects([]);
      setFeedbackNote("");
    } catch (e: any) {
      toast.error("Uložení selhalo: " + (e.message || "unknown"));
    }
    setSavingFeedback(false);
  }, [user?.id, sessionId, rating, likedAspects, dislikedAspects, feedbackNote, stats, settings, learnedPrefs]);

  const ratePatch = useCallback(async (histIdx: number, liked: boolean) => {
    if (!user?.id) return;
    const entry = history[histIdx];
    if (!entry) return;

    const note = liked
      ? `Good patch: "${entry.request}" — ${entry.result.patch.intent}`
      : `Bad patch: "${entry.request}" — ${entry.result.patch.intent}`;

    try {
      await supabase.from("map_gen_feedback").insert([{
        session_id: sessionId,
        user_id: user.id,
        feedback_type: "patch_feedback",
        rating: liked ? 5 : 1,
        notes: note,
        patch_request: entry.request,
        patch_result: entry.result as any,
      }]);

      // Append to style notes
      const existing = learnedPrefs;
      const allNotes = [...(existing?.style_notes || []), note].slice(-20);
      await supabase.from("map_gen_preferences").upsert({
        user_id: user.id,
        style_notes: allNotes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      setLearnedPrefs(prev => prev ? { ...prev, style_notes: allNotes } : prev);
      setHistory(prev => prev.map((h, i) => i === histIdx ? { ...h, rated: liked ? 5 : 1 } : h));
      toast.success(liked ? "👍 Zapamatováno jako dobrý patch" : "👎 Zapamatováno — příště jinak");
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "unknown"));
    }
  }, [user?.id, sessionId, history, learnedPrefs]);

  // Quality score
  const qualityScore = stats ? (() => {
    const biomeDiv = Object.keys(stats.biome_counts).length;
    const landOk = stats.land_ratio > 0.35 && stats.land_ratio < 0.75;
    const coastOk = stats.coastal_count > stats.total_hexes * 0.05;
    const blockOk = stats.blocked_ratio < 0.5;
    let score = 0;
    if (biomeDiv >= 5) score += 25; else if (biomeDiv >= 3) score += 15;
    if (landOk) score += 25;
    if (coastOk) score += 25;
    if (blockOk) score += 25;
    return score;
  })() : null;

  return (
    <Tabs defaultValue="preview" className="space-y-3">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="preview" className="gap-1 text-xs"><Eye className="h-3 w-3" />Náhled</TabsTrigger>
        <TabsTrigger value="settings" className="gap-1 text-xs"><Settings className="h-3 w-3" />Nastavení</TabsTrigger>
        <TabsTrigger value="patch" className="gap-1 text-xs"><Wand2 className="h-3 w-3" />AI Patch</TabsTrigger>
        <TabsTrigger value="learn" className="gap-1 text-xs"><GraduationCap className="h-3 w-3" />Učení</TabsTrigger>
      </TabsList>

      {/* ══ PREVIEW TAB ══ */}
      <TabsContent value="preview" className="space-y-3">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Mapa
              {qualityScore !== null && (
                <Badge variant={qualityScore >= 75 ? "default" : qualityScore >= 50 ? "secondary" : "destructive"} className="ml-1 text-[10px]">
                  Q: {qualityScore}/100
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={loadStats} disabled={loadingStats} className="ml-auto h-7 gap-1">
                {loadingStats ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Načíst
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hexPreview.length > 0 && stats && (
              <HexPreview hexes={hexPreview} bounds={stats.grid_bounds} />
            )}
            {stats && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{stats.total_hexes} hexů</Badge>
                  <Badge variant="outline" className="text-xs">Souš: {(stats.land_ratio * 100).toFixed(0)}%</Badge>
                  <Badge variant="outline" className="text-xs">🌊 Pobřeží: {stats.coastal_count}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(stats.biome_counts).sort((a, b) => b[1] - a[1]).map(([biome, count]) => (
                    <div key={biome} className="flex items-center gap-1 text-xs bg-muted/40 rounded px-2 py-1">
                      <span>{BIOME_EMOJI[biome] || "?"}</span>
                      <span className="capitalize truncate">{biome}</span>
                      <span className="font-mono ml-auto text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!stats && !loadingStats && (
              <p className="text-xs text-muted-foreground text-center py-4">Klikni "Načíst" pro zobrazení mapy</p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={regenerateMap} disabled={regenerating} variant="destructive" className="flex-1 gap-2">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {regenerating ? "Generuji…" : "Regenerovat"}
          </Button>
          <Button onClick={runStrategicPass} disabled={patching} variant="secondary" className="flex-1 gap-2">
            {patching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI Strategic
          </Button>
        </div>
      </TabsContent>

      {/* ══ SETTINGS TAB ══ */}
      <TabsContent value="settings" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> Parametry generátoru
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Šířka: {settings.width}</Label>
                <Slider value={[settings.width]} min={11} max={61} step={2}
                  onValueChange={([v]) => setSettings(s => ({ ...s, width: v }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Výška: {settings.height}</Label>
                <Slider value={[settings.height]} min={11} max={61} step={2}
                  onValueChange={([v]) => setSettings(s => ({ ...s, height: v }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Poměr souše: {(settings.targetLandRatio * 100).toFixed(0)}%</Label>
              <Slider value={[settings.targetLandRatio * 100]} min={20} max={80} step={5}
                onValueChange={([v]) => setSettings(s => ({ ...s, targetLandRatio: v / 100 }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Počet kontinentů: {settings.continentCount}</Label>
              <Slider value={[settings.continentCount]} min={1} max={5} step={1}
                onValueChange={([v]) => setSettings(s => ({ ...s, continentCount: v }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Hory: {(settings.mountainDensity * 100).toFixed(0)}%</Label>
                <Slider value={[settings.mountainDensity * 100]} min={10} max={90} step={5}
                  onValueChange={([v]) => setSettings(s => ({ ...s, mountainDensity: v / 100 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pobřeží: {(settings.coastalRichness * 100).toFixed(0)}%</Label>
                <Slider value={[settings.coastalRichness * 100]} min={10} max={90} step={5}
                  onValueChange={([v]) => setSettings(s => ({ ...s, coastalRichness: v / 100 }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Váhy biomů</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(settings.biomeWeights).map(([biome, weight]) => (
                  <div key={biome} className="space-y-0.5">
                    <Label className="text-[10px] flex items-center gap-1">
                      {BIOME_EMOJI[biome]} {biome}: {weight.toFixed(1)}
                    </Label>
                    <Slider value={[weight * 10]} min={0} max={15} step={1}
                      onValueChange={([v]) => setSettings(s => ({
                        ...s,
                        biomeWeights: { ...s.biomeWeights, [biome]: v / 10 },
                      }))} />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={regenerateMap} disabled={regenerating} className="w-full gap-2">
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Map className="h-4 w-4" />}
              Generovat s těmito parametry
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══ AI PATCH TAB ══ */}
      <TabsContent value="patch" className="space-y-3">
        <Card className="border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-accent-foreground" /> AI Map Patch
              {learnedPrefs && learnedPrefs.total_ratings > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  🧠 {learnedPrefs.total_ratings}x naučeno
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={request} onChange={(e) => setRequest(e.target.value)}
              placeholder="Popiš, co chceš na mapě změnit... (max 80 tile editů)"
              className="min-h-[60px] text-sm" />
            <div className="flex flex-wrap gap-1">
              {PRESET_REQUESTS.map((preset, i) => (
                <Button key={i} size="sm" variant="outline" className="text-[10px] h-6 px-2"
                  onClick={() => setRequest(preset)}>
                  {preset.length > 35 ? preset.slice(0, 33) + "…" : preset}
                </Button>
              ))}
            </div>
            <Button onClick={() => runPatch(request)} disabled={patching || !request.trim()} className="w-full gap-2">
              {patching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Map className="h-4 w-4" />}
              {patching ? "Generuji patch…" : "Aplikovat AI Patch"}
            </Button>
          </CardContent>
        </Card>

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
                        <span className="text-xs font-medium truncate flex-1">{h.request}</span>
                        {!h.rated && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => ratePatch(i, true)} className="hover:scale-110 transition-transform" title="Dobrý patch">
                              <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </button>
                            <button onClick={() => ratePatch(i, false)} className="hover:scale-110 transition-transform" title="Špatný patch">
                              <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        )}
                        {h.rated && (
                          <Badge variant={h.rated >= 4 ? "default" : "destructive"} className="text-[10px]">
                            {h.rated >= 4 ? "👍" : "👎"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground italic">{h.result.patch.intent}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-[10px]">{h.result.applied_count} změn</Badge>
                        {h.result.errors?.length ? (
                          <Badge variant="destructive" className="text-[10px]">{h.result.errors.length} chyb</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* ══ LEARNING TAB ══ */}
      <TabsContent value="learn" className="space-y-3">
        {/* Current knowledge */}
        {learnedPrefs && learnedPrefs.total_ratings > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" /> Naučené preference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  ⭐ Průměr: {learnedPrefs.avg_rating.toFixed(1)}/5
                </Badge>
                <Badge variant="outline" className="text-xs">
                  📊 {learnedPrefs.total_ratings} hodnocení
                </Badge>
              </div>
              {learnedPrefs.style_notes.length > 0 && (
                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {learnedPrefs.style_notes.slice(-8).map((note, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1">{note}</p>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {/* Feedback form */}
        <Card className="border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Ohodnoť aktuální mapu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Celkové hodnocení</Label>
              <StarRating value={rating} onChange={setRating} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">👍 Co se ti líbí</Label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ASPECT_LABELS).map(([key, label]) => (
                  <Button key={key} size="sm" variant={likedAspects.includes(key) ? "default" : "outline"}
                    className="text-[10px] h-6 px-2" onClick={() => toggleAspect(key, likedAspects, setLikedAspects)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-destructive">👎 Co se ti nelíbí</Label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ASPECT_LABELS).map(([key, label]) => (
                  <Button key={key} size="sm" variant={dislikedAspects.includes(key) ? "destructive" : "outline"}
                    className="text-[10px] h-6 px-2" onClick={() => toggleAspect(key, dislikedAspects, setDislikedAspects)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Volná poznámka</Label>
              <Textarea value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="Např: 'Chci víc poloostrovů a méně velkých ploch oceánu'"
                className="min-h-[50px] text-sm" />
            </div>

            <Button onClick={submitFeedback} disabled={savingFeedback || rating === 0} className="w-full gap-2">
              {savingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              Uložit & naučit se
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default SeedMapManager;
