import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Sparkles, RefreshCw, Filter } from "lucide-react";
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
  text: string;
  tone_tag: string;
  created_by: string;
  is_draft: boolean;
  turn_number: number;
  created_at: string;
  related_event_id: string | null;
  related_world_event_id: string | null;
  entity_refs: any;
}

const TONE_LABELS: Record<string, { label: string; emoji: string }> = {
  fear: { label: "Strach", emoji: "😨" },
  pride: { label: "Hrdost", emoji: "🦁" },
  grief: { label: "Smutek", emoji: "😢" },
  hope: { label: "Naděje", emoji: "🌅" },
  anger: { label: "Hněv", emoji: "😠" },
  joy: { label: "Radost", emoji: "🎉" },
  suspicion: { label: "Podezření", emoji: "🤨" },
  neutral: { label: "Zpráva", emoji: "📜" },
};

const CityRumorsPanel = ({
  sessionId, cityId, cityName, ownerPlayer, currentTurn,
  events, memories, epochStyle, entityIndex, onEventClick, onEntityClick,
}: Props) => {
  const [rumors, setRumors] = useState<CityRumor[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDrafts, setShowDrafts] = useState(true);

  const fetchRumors = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("city_rumors")
      .select("*")
      .eq("session_id", sessionId)
      .eq("city_id", cityId)
      .order("turn_number", { ascending: false })
      .limit(50);
    setRumors((data as CityRumor[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRumors(); }, [sessionId, cityId]);

  const generateRumors = async () => {
    setGenerating(true);
    try {
      // Find which turns already have rumors for this city
      const { data: existingRumors } = await supabase
        .from("city_rumors")
        .select("turn_number")
        .eq("session_id", sessionId)
        .eq("city_id", cityId);
      const coveredTurns = new Set((existingRumors || []).map(r => r.turn_number));

      // Find all events for this city across all turns
      const { data: allCityEvents } = await supabase
        .from("game_events")
        .select("id, event_type, player, note, location, result, importance, turn_number, city_id, confirmed")
        .eq("session_id", sessionId)
        .eq("confirmed", true)
        .or(`city_id.eq.${cityId},location.eq.${cityName}`)
        .order("turn_number", { ascending: true })
        .limit(200);

      // Group events by turn
      const eventsByTurn: Record<number, any[]> = {};
      for (const e of allCityEvents || []) {
        const t = e.turn_number || 1;
        if (!eventsByTurn[t]) eventsByTurn[t] = [];
        eventsByTurn[t].push(e);
      }

      // Determine turns that need rumors (have events but no rumors, or no events at all for backfill)
      const turnsToGenerate: number[] = [];
      for (let t = 1; t <= currentTurn; t++) {
        if (!coveredTurns.has(t)) {
          turnsToGenerate.push(t);
        }
      }

      if (turnsToGenerate.length === 0) {
        toast.info("Všechny roky už mají zvěsti");
        setGenerating(false);
        return;
      }

      let totalGenerated = 0;

      // Batch turns into chunks to avoid overwhelming the API
      const chunks: number[][] = [];
      for (let i = 0; i < turnsToGenerate.length; i += 3) {
        chunks.push(turnsToGenerate.slice(i, i + 3));
      }

      for (const chunk of chunks) {
        // Gather events for these turns
        const chunkEvents = chunk.flatMap(t => eventsByTurn[t] || []);
        const representativeTurn = chunk[chunk.length - 1]; // latest turn in chunk

        if (chunkEvents.length > 0) {
          // Use rumor engine for event-based rumors
          const batch = chunkEvents.slice(0, 3);
          for (const evt of batch) {
            const { data } = await supabase.functions.invoke("rumor-engine", {
              body: {
                sessionId,
                eventId: evt.id,
                eventType: evt.event_type,
                currentTurn: evt.turn_number,
                epochStyle: epochStyle || "kroniky",
                isPlayerEvent: false,
              },
            });
            totalGenerated += data?.generated || 0;
          }
        } else {
          // No events for these turns — generate atmospheric gossip
          const cityMemories = memories.filter(m => m.approved && m.city_id === cityId).map(m => m.text);
          const { data, error } = await supabase.functions.invoke("city-rumors", {
            body: {
              cityName, ownerPlayer, currentTurn: representativeTurn,
              confirmedEvents: [],
              leakableNotes: [],
              memories: cityMemories,
              epochStyle: epochStyle || "kroniky",
              turnRange: chunk,
            },
          });
          if (error) throw error;
          const generatedRumors = data?.rumors || [];
          for (let ri = 0; ri < generatedRumors.length; ri++) {
            const rumor = generatedRumors[ri];
            // Distribute rumors across the chunk turns
            const assignedTurn = chunk[ri % chunk.length];
            await supabase.from("city_rumors").insert({
              session_id: sessionId,
              city_id: cityId,
              city_name: cityName,
              text: rumor.text,
              tone_tag: rumor.tone || "neutral",
              created_by: "system",
              is_draft: false,
              turn_number: assignedTurn,
            });
          }
          totalGenerated += generatedRumors.length;
        }
      }

      toast.success(`Vygenerováno ${totalGenerated} zvěstí za ${turnsToGenerate.length} roků`);
      fetchRumors();
    } catch (e: any) {
      console.error("City rumors error:", e);
      toast.error("Generování zvěstí selhalo");
    }
    setGenerating(false);
  };

  const publishDraft = async (rumorId: string) => {
    await supabase.from("city_rumors").update({ is_draft: false }).eq("id", rumorId);
    toast.success("Zvěst publikována");
    fetchRumors();
  };

  const deleteDraft = async (rumorId: string) => {
    await supabase.from("city_rumors").delete().eq("id", rumorId);
    toast.success("Zvěst smazána");
    fetchRumors();
  };

  const visibleRumors = showDrafts ? rumors : rumors.filter(r => !r.is_draft);
  const draftCount = rumors.filter(r => r.is_draft).length;

  return (
    <div className="bg-card p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Zvěsti z {cityName}
          {draftCount > 0 && (
            <Badge variant="outline" className="text-[10px]">{draftCount} konceptů</Badge>
          )}
        </h3>
        <div className="flex gap-1">
          {draftCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowDrafts(!showDrafts)} className="text-[10px]">
              <Filter className="h-3 w-3 mr-1" />
              {showDrafts ? "Skrýt koncepty" : "Ukázat koncepty"}
            </Button>
          )}
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
      ) : visibleRumors.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          V {cityName} se zatím nešeptá... Vygenerujte první zvěsti.
        </p>
      ) : (
        <ScrollArea className="max-h-96">
          <div className="space-y-2">
            {visibleRumors.map((rumor) => {
              const tone = TONE_LABELS[rumor.tone_tag] || TONE_LABELS.neutral;
              return (
                <div
                  key={rumor.id}
                  className={`p-3 rounded-lg border space-y-1 ${
                    rumor.is_draft
                      ? "bg-muted/10 border-dashed border-muted-foreground/30"
                      : "bg-muted/30 border-border/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-display">Rok {rumor.turn_number}</span>
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      {tone.emoji} {tone.label}
                    </Badge>
                    {rumor.is_draft && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">Koncept</Badge>
                    )}
                    {rumor.created_by !== "system" && (
                      <Badge variant="outline" className="text-[10px]">{rumor.created_by}</Badge>
                    )}
                  </div>
                  <RichText
                    text={rumor.text}
                    onEventClick={onEventClick}
                    onEntityClick={onEntityClick}
                    entityIndex={entityIndex}
                    className="text-sm leading-relaxed"
                  />
                  {rumor.is_draft && (
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => publishDraft(rumor.id)}>
                        Publikovat
                      </Button>
                      <Button size="sm" variant="ghost" className="text-[10px] h-6 text-destructive" onClick={() => deleteDraft(rumor.id)}>
                        Smazat
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default CityRumorsPanel;
