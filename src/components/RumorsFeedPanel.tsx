import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, RefreshCw } from "lucide-react";
import RichText from "@/components/RichText";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  cities: any[];
  currentTurn: number;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

interface Rumor {
  id: string;
  city_name: string;
  text: string;
  tone_tag: string;
  turn_number: number;
  is_draft: boolean;
  created_at: string;
  related_event_id: string | null;
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

const RumorsFeedPanel = ({ sessionId, cities, currentTurn, entityIndex, onEventClick, onEntityClick }: Props) => {
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState<string>("all");

  const fetchRumors = async () => {
    setLoading(true);
    let query = supabase
      .from("city_rumors")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_draft", false)
      .order("turn_number", { ascending: false })
      .limit(100);

    if (cityFilter !== "all") {
      query = query.eq("city_name", cityFilter);
    }

    const { data } = await query;
    setRumors((data as Rumor[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRumors(); }, [sessionId, cityFilter]);

  const cityNames = [...new Set(cities.map(c => c.name))].sort();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Zvěsti ze všech měst
        </h3>
        <div className="flex items-center gap-2">
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Filtr města" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechna města</SelectItem>
              {cityNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={fetchRumors} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rumors.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-8 text-center">
          {cityFilter === "all"
            ? "Žádné zvěsti ve světě. Potvrďte události nebo spusťte Rumor Engine."
            : `Žádné zvěsti z města ${cityFilter}.`}
        </p>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-2">
            {rumors.map((rumor) => {
              const tone = TONE_LABELS[rumor.tone_tag] || TONE_LABELS.neutral;
              return (
                <div key={rumor.id} className="p-3 rounded-lg bg-card border border-border/50 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-display">{rumor.city_name}</Badge>
                    <span className="text-[10px] text-muted-foreground">Rok {rumor.turn_number}</span>
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      {tone.emoji} {tone.label}
                    </Badge>
                  </div>
                  <RichText
                    text={rumor.text}
                    onEventClick={onEventClick}
                    onEntityClick={onEntityClick}
                    entityIndex={entityIndex}
                    className="text-sm leading-relaxed"
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default RumorsFeedPanel;
