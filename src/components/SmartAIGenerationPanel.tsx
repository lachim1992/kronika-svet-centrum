import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Image, FileText, CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

interface MissingReport {
  citiesNoDesc: { id: string; name: string }[];
  eventsNoNarrative: { id: string; type: string; player: string; turn: number }[];
  wondersNoDesc: { id: string; name: string }[];
  wondersNoImage: { id: string; name: string }[];
  personsNoBio: { id: string; name: string }[];
  personsNoImage: { id: string; name: string }[];
  wikiNoDesc: { id: string; name: string }[];
  provincesNoDesc: { id: string; name: string }[];
  majorEventsNoRumors: { id: string; type: string; turn: number; location: string }[];
}

const SmartAIGenerationPanel = ({ sessionId, onRefetch }: Props) => {
  const [report, setReport] = useState<MissingReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });

  const scan = async () => {
    setScanning(true);
    try {
      const [
        { data: cities },
        { data: wonders },
        { data: persons },
        { data: wiki },
        { data: provinces },
        { data: events },
        { data: narratives },
        { data: existingRumors },
      ] = await Promise.all([
        supabase.from("cities").select("id, name, flavor_prompt").eq("session_id", sessionId),
        supabase.from("wonders").select("id, name, description, image_url").eq("session_id", sessionId),
        supabase.from("great_persons").select("id, name, bio, image_url").eq("session_id", sessionId),
        supabase.from("wiki_entries").select("id, entity_name, ai_description").eq("session_id", sessionId),
        supabase.from("provinces").select("id, name, ai_description").eq("session_id", sessionId),
        supabase.from("game_events").select("id, event_type, player, turn_number, location").eq("session_id", sessionId).eq("confirmed", true),
        supabase.from("event_narratives").select("event_id").eq("is_canon", true),
        supabase.from("city_rumors").select("related_event_id").eq("session_id", sessionId),
      ]);

      const narrativeEventIds = new Set(narratives?.map(n => n.event_id) || []);
      const rumorEventIds = new Set((existingRumors || []).filter(r => r.related_event_id).map(r => r.related_event_id));

      const MAJOR_TYPES = new Set(["battle", "raid", "war", "diplomacy", "wonder", "plague", "disaster", "found_settlement"]);
      const majorEventsNoRumors = (events || [])
        .filter(e => MAJOR_TYPES.has(e.event_type) && !rumorEventIds.has(e.id))
        .slice(0, 50)
        .map(e => ({ id: e.id, type: e.event_type, turn: e.turn_number, location: e.location || "" }));

      setReport({
        citiesNoDesc: (cities || []).filter(c => !c.flavor_prompt),
        eventsNoNarrative: (events || []).filter(e => !narrativeEventIds.has(e.id)).slice(0, 100).map(e => ({ id: e.id, type: e.event_type, player: e.player, turn: e.turn_number })),
        wondersNoDesc: (wonders || []).filter(w => !w.description || w.description.length < 20),
        wondersNoImage: (wonders || []).filter(w => !w.image_url),
        personsNoBio: (persons || []).filter(p => !p.bio || p.bio.length < 20),
        personsNoImage: (persons || []).filter(p => !p.image_url),
        wikiNoDesc: (wiki || []).filter(w => !w.ai_description).map(w => ({ id: w.id, name: w.entity_name })),
        provincesNoDesc: (provinces || []).filter(p => !p.ai_description),
        majorEventsNoRumors,
      });
    } catch (e) {
      toast.error("Skenování selhalo");
    }
    setScanning(false);
  };

  useEffect(() => { scan(); }, [sessionId]);

  const generateMissingWikiDescriptions = async () => {
    if (!report || report.wikiNoDesc.length === 0) return;
    setGenerating("wiki");
    const total = report.wikiNoDesc.length;
    let done = 0;
    for (const entry of report.wikiNoDesc) {
      setProgress({ current: done, total, label: entry.name });
      try {
        const { data } = await supabase.functions.invoke("wiki-generate", {
          body: { entityName: entry.name, sessionId },
        });
        if (data?.description) {
          await supabase.from("wiki_entries").update({ ai_description: data.description }).eq("id", entry.id);
        }
      } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`Wiki popisy: ${done}/${total} vygenerováno`);
    setGenerating(null);
    onRefetch?.();
    scan();
  };

  const generateMissingEventNarratives = async () => {
    if (!report || report.eventsNoNarrative.length === 0) return;
    setGenerating("narratives");
    const batch = report.eventsNoNarrative.slice(0, 20); // Limit batch
    const total = batch.length;
    let done = 0;
    for (const evt of batch) {
      setProgress({ current: done, total, label: `Událost r.${evt.turn}` });
      try {
        await supabase.functions.invoke("event-narrative", {
          body: { eventId: evt.id, sessionId },
        });
      } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`Narativy: ${done}/${total} vygenerováno`);
    setGenerating(null);
    onRefetch?.();
    scan();
  };

  const generateMissingWonderImages = async () => {
    if (!report || report.wondersNoImage.length === 0) return;
    setGenerating("wonder-images");
    const total = report.wondersNoImage.length;
    let done = 0;
    for (const w of report.wondersNoImage) {
      setProgress({ current: done, total, label: w.name });
      try {
        await supabase.functions.invoke("wonder-portrait", {
          body: { wonderId: w.id },
        });
      } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`Obrázky divů: ${done}/${total} vygenerováno`);
    setGenerating(null);
    onRefetch?.();
    scan();
  };

  const generateMissingPersonImages = async () => {
    if (!report || report.personsNoImage.length === 0) return;
    setGenerating("person-images");
    const total = report.personsNoImage.length;
    let done = 0;
    for (const p of report.personsNoImage) {
      setProgress({ current: done, total, label: p.name });
      try {
        await supabase.functions.invoke("person-portrait", {
          body: { personId: p.id },
        });
      } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`Portréty osobností: ${done}/${total} vygenerováno`);
    setGenerating(null);
    onRefetch?.();
    scan();
  };

  const generateMissingRumors = async () => {
    if (!report || report.majorEventsNoRumors.length === 0) return;
    setGenerating("rumors");
    const batch = report.majorEventsNoRumors.slice(0, 10);
    const total = batch.length;
    let done = 0;
    for (const evt of batch) {
      setProgress({ current: done, total, label: `${evt.type} r.${evt.turn}` });
      try {
        await supabase.functions.invoke("rumor-engine", {
          body: { sessionId, eventId: evt.id, currentTurn: evt.turn, epochStyle: "kroniky", isPlayerEvent: false },
        });
      } catch { /* skip */ }
      done++;
    }
    setProgress({ current: total, total, label: "Hotovo" });
    toast.success(`Zvěsti: ${done}/${total} událostí zpracováno`);
    setGenerating(null);
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
    { key: "majorEventsNoRumors", label: "Události bez zvěstí", count: report.majorEventsNoRumors.length, icon: MessageCircle, action: generateMissingRumors, actionLabel: "Generovat zvěsti (max 10)" },
    { key: "wikiNoDesc", label: "Wiki bez popisu", count: report.wikiNoDesc.length, icon: FileText, action: generateMissingWikiDescriptions, actionLabel: "Generovat wiki popisy" },
    { key: "eventsNoNarrative", label: "Události bez narativu", count: report.eventsNoNarrative.length, icon: FileText, action: generateMissingEventNarratives, actionLabel: "Generovat narativy (max 20)" },
    { key: "wondersNoImage", label: "Divy bez obrázku", count: report.wondersNoImage.length, icon: Image, action: generateMissingWonderImages, actionLabel: "Generovat obrázky divů" },
    { key: "personsNoImage", label: "Osobnosti bez portrétu", count: report.personsNoImage.length, icon: Image, action: generateMissingPersonImages, actionLabel: "Generovat portréty" },
    { key: "citiesNoDesc", label: "Města bez flavor promptu", count: report.citiesNoDesc.length, icon: FileText, action: undefined, actionLabel: "" },
    { key: "wondersNoDesc", label: "Divy bez popisu", count: report.wondersNoDesc.length, icon: FileText, action: undefined, actionLabel: "" },
    { key: "personsNoBio", label: "Osobnosti bez biografie", count: report.personsNoBio.length, icon: FileText, action: undefined, actionLabel: "" },
    { key: "provincesNoDesc", label: "Provincie bez popisu", count: report.provincesNoDesc.length, icon: FileText, action: undefined, actionLabel: "" },
  ];

  const totalMissing = categories.reduce((s, c) => s + c.count, 0);

  return (
    <div className="bg-card border-2 border-primary/20 rounded-lg p-4 space-y-4">
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
          <Button size="sm" variant="ghost" onClick={scan} disabled={scanning}>
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Rescan"}
          </Button>
        </div>
      </div>

      {generating && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <div key={cat.key} className="flex items-center justify-between p-2 rounded border border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{cat.label}</span>
                <Badge variant={cat.count > 0 ? "destructive" : "secondary"} className="text-[10px]">
                  {cat.count}
                </Badge>
              </div>
              {cat.action && cat.count > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={cat.action}
                  disabled={!!generating}
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
