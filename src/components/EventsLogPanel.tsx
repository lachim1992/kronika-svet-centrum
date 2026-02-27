import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { List, ChevronDown, ChevronUp, Swords, Building2, Scroll, Users, Coins, Globe, Shield } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import RichText from "@/components/RichText";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  events: any[];
  currentTurn: number;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

const EVENT_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  founding: { label: "Založení", icon: Building2, color: "text-primary" },
  battle: { label: "Bitva", icon: Swords, color: "text-destructive" },
  diplomacy: { label: "Diplomacie", icon: Users, color: "text-royal-purple" },
  trade: { label: "Obchod", icon: Coins, color: "text-illuminated" },
  law: { label: "Zákon", icon: Scroll, color: "text-forest-green" },
  military: { label: "Vojenství", icon: Shield, color: "text-destructive" },
  crisis: { label: "Krize", icon: Globe, color: "text-destructive" },
};

const EventsLogPanel = ({ sessionId, events, currentTurn, entityIndex, onEventClick, onEntityClick }: Props) => {
  const [turnFilter, setTurnFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = [...events].sort((a, b) => b.turn_number - a.turn_number || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (turnFilter !== "all") result = result.filter(e => e.turn_number === parseInt(turnFilter));
    if (typeFilter !== "all") result = result.filter(e => e.event_type === typeFilter);
    return result;
  }, [events, turnFilter, typeFilter]);

  const turnGroups = useMemo(() => {
    return filtered.reduce<Record<number, any[]>>((acc, e) => {
      (acc[e.turn_number] = acc[e.turn_number] || []).push(e);
      return acc;
    }, {});
  }, [filtered]);

  const sortedTurns = Object.keys(turnGroups).map(Number).sort((a, b) => b - a);
  const eventTypes = [...new Set(events.map(e => e.event_type))].sort();

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <List className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Log událostí</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} událostí</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={turnFilter} onValueChange={setTurnFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Kolo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechna kola</SelectItem>
            {Array.from({ length: currentTurn }, (_, i) => currentTurn - i).map(t => (
              <SelectItem key={t} value={String(t)}>Rok {t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny typy</SelectItem>
            {eventTypes.map(t => (
              <SelectItem key={t} value={t}>
                {EVENT_TYPE_META[t]?.label || t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Tyto surové události slouží jako zdroj dat pro generování Kroniky světa, Mojí kroniky a Dějin.
      </p>

      {/* Feed */}
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-12 text-center">
          Žádné události k zobrazení.
        </p>
      ) : (
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4">
            {sortedTurns.map(turn => (
              <div key={turn}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-1">
                  <span className="text-xs font-display font-bold text-primary tracking-wider uppercase">
                    Rok {turn}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">{turnGroups[turn].length} událostí</span>
                </div>
                <div className="space-y-1.5">
                  {turnGroups[turn].map((evt: any) => {
                    const meta = EVENT_TYPE_META[evt.event_type] || { label: evt.event_type, icon: Globe, color: "text-muted-foreground" };
                    const Icon = meta.icon;
                    const isExpanded = expandedIds.has(evt.id);

                    return (
                      <div
                        key={evt.id}
                        className="p-2.5 rounded-lg border border-border/50 bg-card hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Icon className={`h-3 w-3 ${meta.color}`} />
                          <Badge variant="outline" className="text-[9px] font-display px-1.5 py-0">{meta.label}</Badge>
                          <span className="text-[10px] text-muted-foreground">{evt.player}</span>
                          {evt.location && (
                            <span className="text-[10px] text-muted-foreground">📍 {evt.location}</span>
                          )}
                          <Badge variant={evt.truth_state === "canon" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 ml-auto">
                            {evt.truth_state}
                          </Badge>
                        </div>

                        {evt.note && (
                          <p className="text-xs mt-1 leading-relaxed">{evt.note}</p>
                        )}

                        {/* Expandable details */}
                        {(evt.result || evt.casualties || evt.terms_summary) && (
                          <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(evt.id)}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1 mt-1 gap-0.5">
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {isExpanded ? "Skrýt" : "Detail"}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="text-[10px] text-muted-foreground mt-1 pl-2 border-l-2 border-primary/20 space-y-0.5">
                                {evt.result && <p>Výsledek: {evt.result}</p>}
                                {evt.casualties && <p>Ztráty: {evt.casualties}</p>}
                                {evt.terms_summary && <p>Podmínky: {evt.terms_summary}</p>}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {onEventClick && (
                          <Button
                            variant="ghost" size="sm"
                            className="text-[10px] h-5 px-1.5 mt-1"
                            onClick={() => onEventClick(evt.id)}
                          >
                            Zobrazit detail →
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default EventsLogPanel;
