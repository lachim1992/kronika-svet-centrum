import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles, Loader2, Image, FileText, CheckCircle2, MessageCircle,
  Zap, AlertTriangle, MapPin, Globe, Users, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

interface MissingItem {
  id: string;
  name: string;
  owner?: string;
  type?: string;
  turn?: number;
  location?: string;
  player?: string;
}

interface CategoryData {
  key: string;
  label: string;
  icon: any;
  items: MissingItem[];
  generator: (items: MissingItem[]) => Promise<void>;
}

const HydrationSection = ({ sessionId, onRefetch }: Props) => {
  const [scanning, setScanning] = useState(false);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [hydrationLog, setHydrationLog] = useState<string[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [results, setResults] = useState<{ success: number; skipped: number; failed: number } | null>(null);

  const hLog = useCallback((msg: string) => {
    setHydrationLog(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);
  }, []);

  // ---- Generator functions ----
  const genWiki = async (items: MissingItem[]) => {
    for (const entry of items) {
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: entry.name, entityType: entry.type || "city", entityId: entry.id, sessionId, ownerPlayer: entry.owner || "" },
        });
        if (data?.aiDescription) {
          await supabase.from("wiki_entries").update({ ai_description: data.aiDescription }).eq("id", entry.id);
          hLog(`✅ Wiki: ${entry.name}`);
        }
      } catch { hLog(`❌ Wiki: ${entry.name}`); }
    }
  };

  const genProvinces = async (items: MissingItem[]) => {
    for (const prov of items) {
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: prov.name, entityType: "province", sessionId, ownerPlayer: prov.owner || "" },
        });
        if (data?.aiDescription) {
          await supabase.from("provinces").update({ ai_description: data.aiDescription }).eq("id", prov.id);
          hLog(`✅ Provincie: ${prov.name}`);
        }
      } catch { hLog(`❌ Provincie: ${prov.name}`); }
    }
  };

  const genRegions = async (items: MissingItem[]) => {
    for (const reg of items) {
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: reg.name, entityType: "region", sessionId, ownerPlayer: "" },
        });
        if (data?.aiDescription) {
          await supabase.from("regions").update({ ai_description: data.aiDescription }).eq("id", reg.id);
          hLog(`✅ Region: ${reg.name}`);
        }
      } catch { hLog(`❌ Region: ${reg.name}`); }
    }
  };

  const genCityProfiles = async (items: MissingItem[]) => {
    for (const city of items) {
      try {
        const [{ data: cityEvents }, { data: mems }] = await Promise.all([
          supabase.from("game_events").select("*").eq("session_id", sessionId).eq("city_id", city.id).eq("confirmed", true).limit(30),
          supabase.from("world_memories").select("text, category").eq("session_id", sessionId).eq("city_id", city.id).eq("approved", true).limit(10),
        ]);
        const { data } = await supabase.functions.invoke("cityprofile", {
          body: {
            city: { name: city.name, ownerName: city.owner, level: "Osada", province: "", tags: [], foundedRound: 1, status: "ok" },
            confirmedCityEvents: cityEvents || [], approvedWorldFacts: [], cityMemories: mems || [],
          },
        });
        if (data?.introduction) {
          await supabase.from("cities").update({ flavor_prompt: data.introduction }).eq("id", city.id);
          hLog(`✅ Město: ${city.name}`);
        }
      } catch { hLog(`❌ Město: ${city.name}`); }
    }
  };

  const genWonderDescs = async (items: MissingItem[]) => {
    for (const w of items) {
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: w.name, entityType: "wonder", sessionId, ownerPlayer: "" },
        });
        if (data?.aiDescription) {
          await supabase.from("wonders").update({ description: data.aiDescription }).eq("id", w.id);
          hLog(`✅ Div: ${w.name}`);
        }
      } catch { hLog(`❌ Div: ${w.name}`); }
    }
  };

  const genPersonBios = async (items: MissingItem[]) => {
    for (const p of items) {
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: p.name, entityType: "person", sessionId, ownerPlayer: "" },
        });
        if (data?.aiDescription) {
          await supabase.from("great_persons").update({ bio: data.aiDescription }).eq("id", p.id);
          hLog(`✅ Osobnost: ${p.name}`);
        }
      } catch { hLog(`❌ Osobnost: ${p.name}`); }
    }
  };

  const genEventNarratives = async (items: MissingItem[]) => {
    for (const evt of items.slice(0, 30)) {
      try {
        await supabase.functions.invoke("event-narrative", { body: { eventId: evt.id, sessionId } });
        hLog(`✅ Narativ: ${evt.type} r.${evt.turn}`);
      } catch { hLog(`❌ Narativ: ${evt.id}`); }
    }
  };

  const genRumors = async (items: MissingItem[]) => {
    for (const evt of items.slice(0, 15)) {
      try {
        await supabase.functions.invoke("rumor-engine", {
          body: { sessionId, eventId: evt.id, currentTurn: evt.turn || 1, epochStyle: "kroniky", isPlayerEvent: false },
        });
        hLog(`✅ Zvěst: ${evt.type} r.${evt.turn}`);
      } catch { hLog(`❌ Zvěst: ${evt.id}`); }
    }
  };

  const genWonderImages = async (items: MissingItem[]) => {
    for (const w of items) {
      try {
        await supabase.functions.invoke("wonder-portrait", { body: { wonderId: w.id } });
        hLog(`✅ Obrázek divu: ${w.name}`);
      } catch { hLog(`❌ Obrázek divu: ${w.name}`); }
    }
  };

  const genPersonImages = async (items: MissingItem[]) => {
    for (const p of items) {
      try {
        await supabase.functions.invoke("person-portrait", { body: { personId: p.id } });
        hLog(`✅ Portrét: ${p.name}`);
      } catch { hLog(`❌ Portrét: ${p.name}`); }
    }
  };

  // ---- Scan ----
  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const [
        { data: cities }, { data: wonders }, { data: persons }, { data: wiki },
        { data: provinces }, { data: regions }, { data: events }, { data: narratives },
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

      const narrativeIds = new Set(narratives?.map(n => n.event_id) || []);
      const rumorEventIds = new Set((existingRumors || []).filter(r => r.related_event_id).map(r => r.related_event_id));
      const MAJOR = new Set(["battle", "raid", "war", "diplomacy", "wonder", "plague", "disaster", "found_settlement"]);

      const cats: CategoryData[] = [
        {
          key: "wiki", label: "Wiki bez popisu", icon: FileText,
          items: (wiki || []).filter(w => allowOverwrite || !w.ai_description).map(w => ({ id: w.id, name: w.entity_name, type: w.entity_type, owner: w.owner_player })),
          generator: genWiki,
        },
        {
          key: "provinces", label: "Provincie bez popisu", icon: MapPin,
          items: (provinces || []).filter(p => allowOverwrite || !p.ai_description).map(p => ({ id: p.id, name: p.name, owner: p.owner_player })),
          generator: genProvinces,
        },
        {
          key: "regions", label: "Regiony bez popisu", icon: Globe,
          items: (regions || []).filter(r => allowOverwrite || !r.ai_description).map(r => ({ id: r.id, name: r.name })),
          generator: genRegions,
        },
        {
          key: "cities", label: "Města bez profilu", icon: FileText,
          items: (cities || []).filter(c => allowOverwrite || !c.flavor_prompt).map(c => ({ id: c.id, name: c.name, owner: c.owner_player })),
          generator: genCityProfiles,
        },
        {
          key: "wonderDescs", label: "Divy bez popisu", icon: FileText,
          items: (wonders || []).filter(w => allowOverwrite || !w.description || w.description.length < 20).map(w => ({ id: w.id, name: w.name })),
          generator: genWonderDescs,
        },
        {
          key: "personBios", label: "Osobnosti bez biografie", icon: Users,
          items: (persons || []).filter(p => allowOverwrite || !p.bio || p.bio.length < 20).map(p => ({ id: p.id, name: p.name })),
          generator: genPersonBios,
        },
        {
          key: "narratives", label: "Události bez narativu", icon: FileText,
          items: (events || []).filter(e => allowOverwrite || !narrativeIds.has(e.id)).slice(0, 100).map(e => ({ id: e.id, name: `${e.event_type} r.${e.turn_number}`, type: e.event_type, turn: e.turn_number })),
          generator: genEventNarratives,
        },
        {
          key: "rumors", label: "Události bez zvěstí", icon: MessageCircle,
          items: (events || []).filter(e => MAJOR.has(e.event_type) && (allowOverwrite || !rumorEventIds.has(e.id))).slice(0, 50).map(e => ({ id: e.id, name: `${e.event_type} r.${e.turn_number}`, type: e.event_type, turn: e.turn_number })),
          generator: genRumors,
        },
        {
          key: "wonderImages", label: "Divy bez obrázku", icon: Image,
          items: (wonders || []).filter(w => allowOverwrite || !w.image_url).map(w => ({ id: w.id, name: w.name })),
          generator: genWonderImages,
        },
        {
          key: "personImages", label: "Osobnosti bez portrétu", icon: Image,
          items: (persons || []).filter(p => allowOverwrite || !p.image_url).map(p => ({ id: p.id, name: p.name })),
          generator: genPersonImages,
        },
      ];

      setCategories(cats);
    } catch { toast.error("Skenování selhalo"); }
    setScanning(false);
  }, [sessionId, allowOverwrite]);

  useEffect(() => { scan(); }, [scan]);

  const totalMissing = categories.reduce((s, c) => s + c.items.length, 0);
  const isWorking = !!generating;

  const toggleItem = (catKey: string, itemId: string) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      const set = new Set(next[catKey] || []);
      if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
      next[catKey] = set;
      return next;
    });
  };

  const selectAllInCategory = (catKey: string, items: MissingItem[]) => {
    setSelectedItems(prev => ({ ...prev, [catKey]: new Set(items.map(i => i.id)) }));
  };

  const deselectAllInCategory = (catKey: string) => {
    setSelectedItems(prev => ({ ...prev, [catKey]: new Set<string>() }));
  };

  // Run for selected items in a category
  const runForSelected = async (cat: CategoryData) => {
    const sel = selectedItems[cat.key];
    if (!sel?.size) return;
    const items = cat.items.filter(i => sel.has(i.id));
    setGenerating(cat.key);
    setProgress({ current: 0, total: items.length, label: cat.label });
    let success = 0, failed = 0;
    // Wrap generator to track progress
    const wrapped = items.map((item, idx) => async () => {
      try {
        await cat.generator([item]);
        success++;
      } catch { failed++; }
      setProgress(p => ({ ...p, current: idx + 1, label: item.name }));
    });
    for (const fn of wrapped) await fn();
    setResults({ success, skipped: 0, failed });
    setLastRunTime(new Date().toLocaleString("cs"));
    setGenerating(null);
    toast.success(`${cat.label}: ${success}/${items.length}`);
    onRefetch?.();
    scan();
  };

  // Run all missing in a category
  const runAllInCategory = async (cat: CategoryData) => {
    setGenerating(cat.key);
    const total = cat.items.length;
    setProgress({ current: 0, total, label: cat.label });
    let success = 0, failed = 0;
    for (let i = 0; i < total; i++) {
      setProgress({ current: i, total, label: cat.items[i].name });
      try {
        await cat.generator([cat.items[i]]);
        success++;
      } catch { failed++; }
    }
    setResults({ success, skipped: 0, failed });
    setLastRunTime(new Date().toLocaleString("cs"));
    setGenerating(null);
    toast.success(`${cat.label}: ${success}/${total}`);
    onRefetch?.();
    scan();
  };

  // Hydrate all
  const hydrateAll = async () => {
    setGenerating("all");
    setHydrationLog([]);
    let totalSuccess = 0, totalFailed = 0, totalSkipped = 0;

    for (const cat of categories) {
      if (cat.items.length === 0) { hLog(`✅ ${cat.label}: vše hotovo`); totalSkipped++; continue; }
      hLog(`🔄 ${cat.label}: ${cat.items.length} chybějících...`);
      try {
        await cat.generator(cat.items);
        totalSuccess += cat.items.length;
        hLog(`✅ ${cat.label}: dokončeno`);
      } catch (e: any) {
        totalFailed += cat.items.length;
        hLog(`⚠️ ${cat.label}: ${e?.message || "chyba"}`);
      }
    }

    setResults({ success: totalSuccess, skipped: totalSkipped, failed: totalFailed });
    setLastRunTime(new Date().toLocaleString("cs"));
    setGenerating(null);
    toast.success("🌊 Hydratace dokončena!");
    onRefetch?.();
    scan();
  };

  return (
    <div className="bg-card border-2 border-primary/20 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Hydratace obsahu
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
        <Label htmlFor="hy-overwrite" className="text-xs flex-1 cursor-pointer">
          Povolit přepisování existujícího obsahu (nebezpečné)
        </Label>
        <Switch id="hy-overwrite" checked={allowOverwrite} onCheckedChange={setAllowOverwrite} disabled={isWorking} />
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

      {/* Results summary */}
      {results && lastRunTime && (
        <div className="p-2 bg-muted/30 rounded border text-xs space-y-1">
          <div className="flex justify-between">
            <span>Poslední běh: {lastRunTime}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-primary">✅ {results.success} úspěch</span>
            <span className="text-muted-foreground">⏭ {results.skipped} přeskočeno</span>
            <span className="text-destructive">❌ {results.failed} selhalo</span>
          </div>
        </div>
      )}

      {/* HYDRATE ALL button */}
      <Button onClick={hydrateAll} disabled={isWorking || totalMissing === 0} className="w-full h-12 font-display text-base gap-2">
        {generating === "all" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
        {generating === "all" ? "Hydratace probíhá..." : `🌊 HYDRATOVAT VŠE (${totalMissing} položek)`}
      </Button>

      {/* Per-category with expandable item lists */}
      <div className="space-y-1">
        {categories.map(cat => {
          const Icon = cat.icon;
          const isExpanded = expandedCat === cat.key;
          const sel = selectedItems[cat.key] || new Set<string>();

          return (
            <div key={cat.key} className="border rounded bg-muted/20">
              <div className="flex items-center justify-between p-2 cursor-pointer" onClick={() => setExpandedCat(isExpanded ? null : cat.key)}>
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{cat.label}</span>
                  <Badge variant={cat.items.length > 0 ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                    {cat.items.length}
                  </Badge>
                </div>
                <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                  {sel.size > 0 && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => runForSelected(cat)} disabled={isWorking}>
                      {generating === cat.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      Vybrané ({sel.size})
                    </Button>
                  )}
                  {cat.items.length > 0 && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => runAllInCategory(cat)} disabled={isWorking}>
                      Vše
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && cat.items.length > 0 && (
                <div className="px-2 pb-2">
                  <div className="flex gap-2 mb-1">
                    <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1" onClick={() => selectAllInCategory(cat.key, cat.items)}>
                      Vybrat vše
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1" onClick={() => deselectAllInCategory(cat.key)}>
                      Zrušit výběr
                    </Button>
                  </div>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-0.5">
                      {cat.items.slice(0, 50).map(item => (
                        <label key={item.id} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted/40 cursor-pointer">
                          <Checkbox
                            checked={sel.has(item.id)}
                            onCheckedChange={() => toggleItem(cat.key, item.id)}
                          />
                          <span className="truncate">{item.name}</span>
                          {item.owner && <span className="text-muted-foreground ml-auto shrink-0">{item.owner}</span>}
                        </label>
                      ))}
                      {cat.items.length > 50 && (
                        <p className="text-[10px] text-muted-foreground pl-6">...a {cat.items.length - 50} dalších</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
    </div>
  );
};

export default HydrationSection;
