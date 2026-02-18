import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  cityId: string;
  cityName: string;
  ownerPlayer: string;
  currentTurn: number;
  events: any[];
  memories: any[];
  epochStyle?: string;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

interface CityRumor {
  id: string;
  content: string;
  feed_type: string;
  importance: string;
  turn_number: number;
  created_at: string;
  linked_event_id: string | null;
}

const CityRumorsPanel = ({
  sessionId, cityId, cityName, ownerPlayer, currentTurn,
  events, memories, epochStyle, entityIndex, onEventClick, onEntityClick,
}: Props) => {
  const [rumors, setRumors] = useState<CityRumor[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchRumors = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("world_feed_items")
      .select("*")
      .eq("session_id", sessionId)
      .eq("linked_city", cityName)
      .order("turn_number", { ascending: false })
      .limit(50);
    setRumors((data as CityRumor[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRumors(); }, [sessionId, cityName]);

  const generateRumors = async () => {
    setGenerating(true);
    try {
      // Get nearby events (events involving this city or its province)
      const cityEvents = events.filter(e =>
        e.city_id === cityId ||
        e.attacker_city_id === cityId ||
        e.defender_city_id === cityId ||
        e.secondary_city_id === cityId ||
        e.location === cityName
      ).slice(0, 20);

      // Get leakable annotations
      const eventIds = cityEvents.map(e => e.id);
      let leakableNotes: any[] = [];
      if (eventIds.length > 0) {
        const { data: annotations } = await supabase
          .from("event_annotations")
          .select("*")
          .in("event_id", eventIds.slice(0, 50))
          .in("visibility", ["public", "leakable"]);
        leakableNotes = annotations || [];
      }

      // Call AI to generate city-specific rumors
      const { data, error } = await supabase.functions.invoke("city-rumors", {
        body: {
          cityName,
          ownerPlayer,
          currentTurn,
          confirmedEvents: cityEvents.filter(e => e.confirmed),
          leakableNotes,
          memories: memories.filter(m => m.approved && (m.city_id === cityId)).map(m => m.text),
          epochStyle: epochStyle || "kroniky",
        },
      });

      if (error) throw error;

      const generatedRumors = data?.rumors || [];

      // Store as world_feed_items with linked_city
      for (const rumor of generatedRumors) {
        await supabase.from("world_feed_items").insert({
          session_id: sessionId,
          content: rumor.text,
          feed_type: rumor.type === "verified" ? "news" : "gossip",
          importance: rumor.type === "propaganda" ? "high" : "normal",
          turn_number: currentTurn,
          linked_city: cityName,
          references: rumor.references || [],
        });
      }

      toast.success(`Vygenerováno ${generatedRumors.length} zvěstí pro ${cityName}`);
      fetchRumors();
    } catch (e: any) {
      console.error("City rumors error:", e);
      toast.error("Generování zvěstí selhalo");
    }
    setGenerating(false);
  };

  const importanceBadge = (imp: string) => {
    if (imp === "high") return <Badge variant="destructive" className="text-[10px]">Důležité</Badge>;
    if (imp === "low") return <Badge variant="outline" className="text-[10px]">Šepot</Badge>;
    return null;
  };

  const typeBadge = (type: string) => {
    if (type === "gossip") return <Badge variant="secondary" className="text-[10px]">Drb</Badge>;
    if (type === "news") return <Badge variant="default" className="text-[10px]">Zpráva</Badge>;
    return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
  };

  return (
    <div className="bg-card p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Zvěsti z {cityName}
        </h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={fetchRumors} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={generateRumors} disabled={generating} className="font-display">
            {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            {generating ? "Generuji..." : "Nové zvěsti"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rumors.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          V {cityName} se zatím nešeptá... Vygenerujte první zvěsti.
        </p>
      ) : (
        <ScrollArea className="max-h-96">
          <div className="space-y-2">
            {rumors.map((rumor) => (
              <div key={rumor.id} className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-display">Rok {rumor.turn_number}</span>
                  {typeBadge(rumor.feed_type)}
                  {importanceBadge(rumor.importance)}
                </div>
                <RichText
                  text={rumor.content}
                  onEventClick={onEventClick}
                  onEntityClick={onEntityClick}
                  entityIndex={entityIndex}
                  className="text-sm leading-relaxed"
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default CityRumorsPanel;
