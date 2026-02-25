import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Eye, ChevronDown, ChevronUp, Shield, Coins, Users, Skull, HelpCircle, Globe, MapPin, Map } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  currentTurn: number;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

interface Rumor {
  id: string;
  turn_number: number;
  category: string;
  scope: string;
  confidence: number;
  bias: string;
  tone: string;
  short_text: string;
  expanded_text: string | null;
  entity_refs: {
    event_ids?: string[];
    city_ids?: string[];
    battle_ids?: string[];
    wiki_ids?: string[];
    person_ids?: string[];
  };
  is_reminder: boolean;
  reminder_of_turn: number | null;
  created_at: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  war: { label: "Válka", icon: Skull, color: "text-destructive" },
  politics: { label: "Politika", icon: Shield, color: "text-royal-purple" },
  economy: { label: "Ekonomika", icon: Coins, color: "text-illuminated" },
  society: { label: "Společnost", icon: Users, color: "text-forest-green" },
  mystery: { label: "Záhada", icon: HelpCircle, color: "text-primary" },
};

const SCOPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  local: { label: "Místní", icon: MapPin },
  regional: { label: "Regionální", icon: Map },
  world: { label: "Světová", icon: Globe },
};

const TONE_LABELS: Record<string, string> = {
  ominous: "🌑 Zlověstné",
  hopeful: "🌅 Nadějné",
  cynical: "😏 Cynické",
  urgent: "⚡ Naléhavé",
  nostalgic: "📜 Nostalgické",
  fearful: "😨 Strach",
  proud: "🦁 Hrdost",
  neutral: "📰 Zpráva",
};

const BIAS_LABELS: Record<string, string> = {
  propaganda: "Dvorní propaganda",
  merchant: "Kupecké řeči",
  peasant: "Selská šuškanda",
  spy: "Špehovo hlášení",
  noble: "Šlechtický dvůr",
  clergy: "Klérus",
};

const SeptandaFeed = ({ sessionId, currentTurn, entityIndex, onEventClick, onEntityClick }: Props) => {
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchRumors = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("rumors")
      .select("*")
      .eq("session_id", sessionId)
      .order("turn_number", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
    if (scopeFilter !== "all") query = query.eq("scope", scopeFilter);

    const { data } = await query;
    setRumors((data as Rumor[]) || []);
    setLoading(false);
  }, [sessionId, categoryFilter, scopeFilter]);

  useEffect(() => { fetchRumors(); }, [fetchRumors]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group by turn
  const turnGroups = rumors.reduce<Record<number, Rumor[]>>((acc, r) => {
    (acc[r.turn_number] = acc[r.turn_number] || []).push(r);
    return acc;
  }, {});

  const sortedTurns = Object.keys(turnGroups).map(Number).sort((a, b) => b - a);

  const handleRefClick = (refs: Rumor["entity_refs"]) => {
    if (refs.event_ids?.length && onEventClick) {
      onEventClick(refs.event_ids[0]);
      return;
    }
    if (refs.city_ids?.length && onEntityClick) {
      onEntityClick("city", refs.city_ids[0]);
      return;
    }
    if (refs.wiki_ids?.length && onEntityClick) {
      onEntityClick("wiki", refs.wiki_ids[0]);
      return;
    }
    if (refs.person_ids?.length && onEntityClick) {
      onEntityClick("person", refs.person_ids[0]);
      return;
    }
  };

  const getRefCount = (refs: Rumor["entity_refs"]) => {
    return (refs.event_ids?.length || 0) + (refs.city_ids?.length || 0) +
      (refs.battle_ids?.length || 0) + (refs.wiki_ids?.length || 0) + (refs.person_ids?.length || 0);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny kategorie</SelectItem>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Rozsah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny rozsahy</SelectItem>
            {Object.entries(SCOPE_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="ghost" onClick={fetchRumors} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rumors.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-12 text-center">
          Žádné zvěsti. Pokračuj ve hře — šeptanda se začne šířit po dalším kole.
        </p>
      ) : (
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6">
            {sortedTurns.map(turn => (
              <div key={turn}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-1">
                  <span className="text-xs font-display font-bold text-primary tracking-wider uppercase">
                    Rok {turn}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">{turnGroups[turn].length} zvěstí</span>
                </div>
                <div className="space-y-2">
                  {turnGroups[turn].map(rumor => {
                    const cat = CATEGORY_META[rumor.category] || CATEGORY_META.society;
                    const scope = SCOPE_META[rumor.scope] || SCOPE_META.local;
                    const CatIcon = cat.icon;
                    const ScopeIcon = scope.icon;
                    const isExpanded = expandedIds.has(rumor.id);
                    const refCount = getRefCount(rumor.entity_refs);

                    return (
                      <div
                        key={rumor.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          rumor.is_reminder
                            ? "bg-muted/30 border-border/30 italic"
                            : "bg-card border-border/50 hover:border-primary/30"
                        }`}
                      >
                        {/* Header badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <CatIcon className={`h-3 w-3 ${cat.color}`} />
                          <Badge variant="outline" className="text-[9px] font-display px-1.5 py-0">{cat.label}</Badge>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                            <ScopeIcon className="h-2.5 w-2.5" />{scope.label}
                          </Badge>
                          {rumor.is_reminder && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                              📜 Připomínka (rok {rumor.reminder_of_turn})
                            </Badge>
                          )}
                          <span className="ml-auto text-[9px] text-muted-foreground italic">
                            {BIAS_LABELS[rumor.bias] || rumor.bias}
                          </span>
                        </div>

                        {/* Main text */}
                        <p className="text-sm leading-relaxed">{rumor.short_text}</p>

                        {/* Footer */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[9px] text-muted-foreground">
                            {TONE_LABELS[rumor.tone] || rumor.tone}
                          </span>

                          {/* Confidence bar */}
                          <div className="flex items-center gap-1">
                            <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${rumor.confidence}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground">{rumor.confidence}%</span>
                          </div>

                          {refCount > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[10px] h-5 px-1.5 ml-auto"
                              onClick={() => handleRefClick(rumor.entity_refs)}
                            >
                              Zobrazit zdroj →
                            </Button>
                          )}
                        </div>

                        {/* Expanded text */}
                        {rumor.expanded_text && (
                          <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(rumor.id)}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1 mt-1 gap-0.5">
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {isExpanded ? "Skrýt" : "Více"}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed pl-2 border-l-2 border-primary/20">
                                {rumor.expanded_text}
                              </p>
                            </CollapsibleContent>
                          </Collapsible>
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

export default SeptandaFeed;
