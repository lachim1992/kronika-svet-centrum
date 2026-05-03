import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, Loader2, Image, FileText, CheckCircle2, MessageCircle,
  Zap, AlertTriangle, MapPin, Globe, Users,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

interface MissingReport {
  citiesNoDesc: { id: string; name: string; owner: string }[];
  eventsNoNarrative: { id: string; type: string; player: string; turn: number }[];
  wondersNoDesc: { id: string; name: string }[];
  wondersNoImage: { id: string; name: string }[];
  personsNoBio: { id: string; name: string }[];
  personsNoImage: { id: string; name: string }[];
  wikiNoDesc: { id: string; name: string; type: string; owner: string }[];
  provincesNoDesc: { id: string; name: string; owner: string }[];
  regionsNoDesc: { id: string; name: string }[];
  majorEventsNoRumors: { id: string; type: string; turn: number; location: string }[];
  citiesNoRumors: { id: string; name: string }[];
}

type GeneratingKey = string | null;

const SmartAIGenerationPanel = ({ sessionId, onRefetch }: Props) => {
  const [report, setReport] = useState<MissingReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState<GeneratingKey>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [hydrationLog, setHydrationLog] = useState<string[]>([]);

  const hLog = useCallback((msg: string) => {
    setHydrationLog(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);
  }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const [
        { data: cities },
        { data: wonders },
        { data: persons },
        { data: wiki },
        { data: provinces },
        { data: regions },
        { data: events },
        { data: narratives },
        { data: existingRumors },
      ] = await Promise.all([
        supabase.from("cities").select("id, name, flavor_prompt, owner_player").eq("session_id", sessionId),
        supabase.from("wonders").select("id, name, description, image_url").eq("session_id", sessionId),
        supabase.from("great_persons").select("id, name, bio, image_url").eq("session_id", sessionId),
        supabase.from("wiki_entries").select("id, entity_name, entity_type, ai_description, owner_player").eq("session_id", sessionId),
        supabase.from("provinces").select("id, name, ai_description, owner_player").eq("session_id", sessionId),
        supabase.from("regions").select("id, name, ai_description").eq("session_id", sessionId),
        supabase.from("game_events").select("id, event_type, player, turn_number, location").eq("session_id", sessionId).eq("confirmed", true),
        supabase.from("event_narratives").select("event_id").eq("is_canon", true),
        supabase.from("city_rumors").select("related_event_id, city_id").eq("session_id", sessionId),
      ]);

      const narrativeEventIds = new Set(narratives?.map(n => n.event_id) || []);
      const rumorEventIds = new Set((existingRumors || []).filter(r => r.related_event_id).map(r => r.related_event_id));
      const citiesWithRumors = new Set((existingRumors || []).map(r => r.city_id));

      const MAJOR_TYPES = new Set(["battle", "raid", "war", "diplomacy", "wonder", "plague", "disaster", "found_settlement"]);

      setReport({
        citiesNoDesc: (cities || []).filter(c => allowOverwrite || !c.flavor_prompt)
          .map(c => ({ id: c.id, name: c.name, owner: c.owner_player })),
        eventsNoNarrative: (events || []).filter(e => allowOverwrite || !narrativeEventIds.has(e.id))
          .slice(0, 100).map(e => ({ id: e.id, type: e.event_type, player: e.player, turn: e.turn_number })),
        wondersNoDesc: (wonders || []).filter(w => allowOverwrite || !w.description || w.description.length < 20),
        wondersNoImage: (wonders || []).filter(w => allowOverwrite || !w.image_url),
        personsNoBio: (persons || []).filter(p => allowOverwrite || !p.bio || p.bio.length < 20),
        personsNoImage: (persons || []).filter(p => allowOverwrite || !p.image_url),
        wikiNoDesc: (wiki || []).filter(w => allowOverwrite || !w.ai_description)
          .map(w => ({ id: w.id, name: w.entity_name, type: w.entity_type, owner: w.owner_player })),
        provincesNoDesc: (provinces || []).filter(p => allowOverwrite || !p.ai_description)
          .map(p => ({ id: p.id, name: p.name, owner: p.owner_player })),
        regionsNoDesc: (regions || []).filter(r => allowOverwrite || !r.ai_description),
        majorEventsNoRumors: (events || [])
          .filter(e => MAJOR_TYPES.has(e.event_type) && (allowOverwrite || !rumorEventIds.has(e.id)))
          .slice(0, 50)
          .map(e => ({ id: e.id, type: e.event_type, turn: e.turn_number, location: e.location || "" })),
        citiesNoRumors: (cities || []).filter(c => allowOverwrite || !citiesWithRumors.has(c.id))
          .map(c => ({ id: c.id, name: c.name })),
      });
    } catch {
      toast.error("Skenování selhalo");
    }
    setScanning(false);
  };

  useEffect(() => { scan(); }, [sessionId, allowOverwrite]);

  // --- Individual generators ---

  const runBatch = async (
    key: string,
    items: any[],
    fn: (item: any, idx: number) => Promise<void>,
    labelFn: (item: any) => string,
    doneMsg: string,
    batchLimit?: number,
  ) => {
    if (!items.length) return;
    setGenerating(key);
    const batch = batchLimit ? items.slice(0, batchLimit) : items;
    const total = batch.length;
    let done = 0;
    for (const item of batch) {
      setProgress({ current: done, total, label: labelFn(item) });
      try { await fn(item, done); } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`${doneMsg}: ${done}/${total}`);
    setGenerating(null);
    onRefetch?.();
    scan();
  };

  const generateWikiDescriptions = () => runBatch(
    "wiki", report!.wikiNoDesc,
    async (entry) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({
        sessionId, entityType: entry.type, entityId: entry.id, entityName: entry.name, ownerPlayer: entry.owner,
      });
    },
    (e) => e.name,
    "Wiki popisy",
  );

  const generateEventNarratives = () => runBatch(
    "narratives", report!.eventsNoNarrative,
    async (evt) => {
      await supabase.functions.invoke("event-narrative", {
        body: { eventId: evt.id, sessionId },
      });
    },
    (e) => `Událost r.${e.turn}`,
    "Narativy událostí",
    30,
  );

  const generateWonderImages = () => runBatch(
    "wonder-images", report!.wondersNoImage,
    async (w) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({ sessionId, entityType: "wonder", entityId: w.id, entityName: w.name });
    },
    (w) => w.name,
    "Obrázky divů",
  );

  const generatePersonImages = () => runBatch(
    "person-images", report!.personsNoImage,
    async (p) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({ sessionId, entityType: "person", entityId: p.id, entityName: p.name });
    },
    (p) => p.name,
    "Portréty osobností",
  );

  const generateRumors = () => runBatch(
    "rumors", report!.majorEventsNoRumors,
    async (evt) => {
      await supabase.functions.invoke("rumor-engine", {
        body: { sessionId, eventId: evt.id, currentTurn: evt.turn, epochStyle: "kroniky", isPlayerEvent: false },
      });
    },
    (e) => `${e.type} r.${e.turn}`,
    "Zvěsti z událostí",
    15,
  );

  const generateProvinceDescriptions = () => runBatch(
    "provinces", report!.provincesNoDesc,
    async (prov) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({
        sessionId, entityType: "province", entityId: prov.id, entityName: prov.name, ownerPlayer: prov.owner,
      });
      const { data: w } = await supabase.from("wiki_entries")
        .select("ai_description").eq("session_id", sessionId)
        .eq("entity_type", "province").eq("entity_id", prov.id).maybeSingle();
      if (w?.ai_description) {
        await supabase.from("provinces").update({ ai_description: w.ai_description }).eq("id", prov.id);
      }
    },
    (p) => p.name,
    "Popisy provincií",
  );

  const generateRegionDescriptions = () => runBatch(
    "regions", report!.regionsNoDesc,
    async (reg) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({
        sessionId, entityType: "region", entityId: reg.id, entityName: reg.name,
      });
      const { data: w } = await supabase.from("wiki_entries")
        .select("ai_description").eq("session_id", sessionId)
        .eq("entity_type", "region").eq("entity_id", reg.id).maybeSingle();
      if (w?.ai_description) {
        await supabase.from("regions").update({ ai_description: w.ai_description }).eq("id", reg.id);
      }
    },
    (r) => r.name,
    "Popisy regionů",
  );

  const generateCityProfiles = () => runBatch(
    "city-profiles", report!.citiesNoDesc,
    async (city) => {
      const [{ data: cityEvents }, { data: mems }] = await Promise.all([
        supabase.from("game_events").select("*").eq("session_id", sessionId).eq("city_id", city.id).eq("confirmed", true).limit(30),
        supabase.from("world_memories").select("text, category").eq("session_id", sessionId).eq("city_id", city.id).eq("approved", true).limit(10),
      ]);
      const { data } = await supabase.functions.invoke("cityprofile", {
        body: {
          city: { name: city.name, ownerName: city.owner, level: "Osada", province: "", tags: [], foundedRound: 1, status: "ok" },
          confirmedCityEvents: cityEvents || [],
          approvedWorldFacts: [],
          cityMemories: mems || [],
        },
      });
      if (data?.introduction) {
        await supabase.from("cities").update({ flavor_prompt: data.introduction }).eq("id", city.id);
      }
    },
    (c) => c.name,
    "Profily měst",
  );

  const generatePersonBios = () => runBatch(
    "person-bios", report!.personsNoBio,
    async (p) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({
        sessionId, entityType: "person", entityId: p.id, entityName: p.name,
      });
      const { data: w } = await supabase.from("wiki_entries")
        .select("ai_description").eq("session_id", sessionId)
        .eq("entity_type", "person").eq("entity_id", p.id).maybeSingle();
      if (w?.ai_description) {
        await supabase.from("great_persons").update({ bio: w.ai_description }).eq("id", p.id);
      }
    },
    (p) => p.name,
    "Biografie osobností",
  );

  const generateWonderDescriptions = () => runBatch(
    "wonder-descs", report!.wondersNoDesc,
    async (w) => {
      const { ensureWikiEntry } = await import("@/lib/wikiOrchestrator");
      await ensureWikiEntry({
        sessionId, entityType: "wonder", entityId: w.id, entityName: w.name,
      });
      const { data: we } = await supabase.from("wiki_entries")
        .select("ai_description").eq("session_id", sessionId)
        .eq("entity_type", "wonder").eq("entity_id", w.id).maybeSingle();
      if (we?.ai_description) {
        await supabase.from("wonders").update({ description: we.ai_description }).eq("id", w.id);
      }
    },
    (w) => w.name,
    "Popisy divů",
  );

  // --- FULL HYDRATION ---
  const hydrateWorld = async () => {
    if (!report) return;
    setHydrating(true);
    setHydrationLog([]);
    hLog("🌊 Spouštím plnou hydrataci světa...");

    const steps: { key: string; label: string; count: number; fn: () => Promise<void> }[] = [
      { key: "wiki", label: "Wiki popisy", count: report.wikiNoDesc.length, fn: generateWikiDescriptions },
      { key: "provinces", label: "Popisy provincií", count: report.provincesNoDesc.length, fn: generateProvinceDescriptions },
      { key: "regions", label: "Popisy regionů", count: report.regionsNoDesc.length, fn: generateRegionDescriptions },
      { key: "city-profiles", label: "Profily měst", count: report.citiesNoDesc.length, fn: generateCityProfiles },
      { key: "wonder-descs", label: "Popisy divů", count: report.wondersNoDesc.length, fn: generateWonderDescriptions },
      { key: "person-bios", label: "Biografie osobností", count: report.personsNoBio.length, fn: generatePersonBios },
      { key: "narratives", label: "Narativy událostí", count: Math.min(report.eventsNoNarrative.length, 30), fn: generateEventNarratives },
      { key: "rumors", label: "Zvěsti", count: Math.min(report.majorEventsNoRumors.length, 15), fn: generateRumors },
      { key: "wonder-images", label: "Obrázky divů", count: report.wondersNoImage.length, fn: generateWonderImages },
      { key: "person-images", label: "Portréty osobností", count: report.personsNoImage.length, fn: generatePersonImages },
    ];

    for (const step of steps) {
      if (step.count === 0) {
        hLog(`✅ ${step.label}: vše hotovo`);
        continue;
      }
      hLog(`🔄 ${step.label}: ${step.count} chybějících...`);
      try {
        await step.fn();
        hLog(`✅ ${step.label}: dokončeno`);
      } catch (e: any) {
        hLog(`⚠️ ${step.label}: ${e?.message || "chyba"}`);
      }
    }

    // Populate feed with summary items
    hLog("📰 Doplňuji feed...");
    try {
      const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const turn = session?.current_turn || 1;
      const { data: existingFeed } = await supabase.from("world_feed_items").select("id").eq("session_id", sessionId).limit(1);
      if (!existingFeed?.length) {
        await supabase.from("world_feed_items").insert([
          { session_id: sessionId, turn_number: Math.max(1, turn - 2), content: "Kroniky světa byly otevřeny. Učenci začínají zaznamenávat dějiny civilizací.", feed_type: "announcement", importance: "legendary" },
          { session_id: sessionId, turn_number: Math.max(1, turn - 1), content: "Obchodníci z dalekých zemí přinášejí zvěsti o nových říších a jejich vládcích.", feed_type: "gossip", importance: "normal" },
          { session_id: sessionId, turn_number: turn, content: "Kronikáři dokončili první mapování známého světa. Města, provincie a regiony byly zaneseny do análů.", feed_type: "announcement", importance: "memorable" },
        ]);
        hLog("✅ Feed: 3 základní záznamy vytvořeny");
      } else {
        hLog("✅ Feed: již existuje");
      }
    } catch (e: any) {
      hLog(`⚠️ Feed: ${e?.message || "chyba"}`);
    }

    hLog("🏁 Hydratace dokončena!");
    toast.success("🌊 Svět hydratován — města, provincie, události, zvěsti a feed připraveny!");
    setHydrating(false);
    onRefetch?.();
    scan();
  };

  if (!report) {
    return (
      <div className="bg-card border rounded-lg p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Skenuji chybějící obsah...</span>
      </div>
    );
  }

  const categories = [
    { key: "wikiNoDesc", label: "Wiki bez popisu", count: report.wikiNoDesc.length, icon: FileText, action: generateWikiDescriptions, actionLabel: "Generovat wiki" },
    { key: "provincesNoDesc", label: "Provincie bez popisu", count: report.provincesNoDesc.length, icon: MapPin, action: generateProvinceDescriptions, actionLabel: "Generovat popisy" },
    { key: "regionsNoDesc", label: "Regiony bez popisu", count: report.regionsNoDesc.length, icon: Globe, action: generateRegionDescriptions, actionLabel: "Generovat popisy" },
    { key: "citiesNoDesc", label: "Města bez profilu", count: report.citiesNoDesc.length, icon: FileText, action: generateCityProfiles, actionLabel: "Generovat profily" },
    { key: "wondersNoDesc", label: "Divy bez popisu", count: report.wondersNoDesc.length, icon: FileText, action: generateWonderDescriptions, actionLabel: "Generovat popisy" },
    { key: "personsNoBio", label: "Osobnosti bez biografie", count: report.personsNoBio.length, icon: Users, action: generatePersonBios, actionLabel: "Generovat bio" },
    { key: "eventsNoNarrative", label: "Události bez narativu", count: report.eventsNoNarrative.length, icon: FileText, action: generateEventNarratives, actionLabel: "Generovat (max 30)" },
    { key: "majorEventsNoRumors", label: "Události bez zvěstí", count: report.majorEventsNoRumors.length, icon: MessageCircle, action: generateRumors, actionLabel: "Generovat (max 15)" },
    { key: "wondersNoImage", label: "Divy bez obrázku", count: report.wondersNoImage.length, icon: Image, action: generateWonderImages, actionLabel: "Generovat obrázky" },
    { key: "personsNoImage", label: "Osobnosti bez portrétu", count: report.personsNoImage.length, icon: Image, action: generatePersonImages, actionLabel: "Generovat portréty" },
  ];

  const totalMissing = categories.reduce((s, c) => s + c.count, 0);
  const isWorking = !!generating || hydrating;

  return (
    <div className="bg-card border-2 border-primary/20 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Smart AI — Chybějící obsah
        </h3>
        <div className="flex items-center gap-2">
          {totalMissing === 0 ? (
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Vše vyplněno</Badge>
          ) : (
            <Badge variant="destructive">{totalMissing} chybí</Badge>
          )}
          <Button size="sm" variant="ghost" onClick={scan} disabled={scanning || isWorking}>
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Rescan"}
          </Button>
        </div>
      </div>

      {/* Overwrite toggle */}
      <div className="flex items-center gap-3 p-2 rounded border border-destructive/30 bg-destructive/5">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <Label htmlFor="overwrite-toggle" className="text-xs flex-1 cursor-pointer">
          Povolit přepisování existujícího obsahu (nebezpečné)
        </Label>
        <Switch
          id="overwrite-toggle"
          checked={allowOverwrite}
          onCheckedChange={setAllowOverwrite}
          disabled={isWorking}
        />
      </div>

      {/* Progress */}
      {generating && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
        </div>
      )}

      {/* HYDRATE WORLD button */}
      <Button
        onClick={hydrateWorld}
        disabled={isWorking || totalMissing === 0}
        className="w-full h-12 font-display text-base gap-2"
        variant="default"
      >
        {hydrating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
        {hydrating ? "Hydratace probíhá..." : `🌊 HYDRATOVAT SVĚT (${totalMissing} položek)`}
      </Button>

      {/* Hydration log */}
      {hydrationLog.length > 0 && (
        <ScrollArea className="h-32 border rounded p-2 bg-muted/30">
          <div className="space-y-0.5 font-mono text-[11px]">
            {hydrationLog.map((line, i) => (
              <div key={i} className="text-muted-foreground">{line}</div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Individual categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <div key={cat.key} className="flex items-center justify-between p-2 rounded border border-border bg-muted/20">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{cat.label}</span>
                <Badge variant={cat.count > 0 ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                  {cat.count}
                </Badge>
              </div>
              {cat.action && cat.count > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 shrink-0 ml-2"
                  onClick={cat.action}
                  disabled={isWorking}
                >
                  {generating === cat.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {cat.actionLabel}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SmartAIGenerationPanel;
