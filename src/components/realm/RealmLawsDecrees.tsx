import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Megaphone, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

const EFFECT_LABELS: Record<string, string> = {
  tax_change: "💰 Daně", tax_rate_percent: "🪙 Daň%", grain_ration_modifier: "🌾 Příděl",
  trade_restriction: "🚫 Obchod", active_pop_modifier: "👷 Práce", military_funding: "⚔️ Vojsko",
  civil_reform: "🏛️ Reforma", max_mobilization_modifier: "🛡️ Odvody",
};

const RealmLawsDecrees = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [laws, setLaws] = useState<any[]>([]);
  const [decrees, setDecrees] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<"laws" | "decrees" | null>("laws");

  useEffect(() => {
    const fetchData = async () => {
      const [lawsRes, decreesRes] = await Promise.all([
        supabase.from("laws").select("*")
          .eq("session_id", sessionId)
          .eq("player_name", currentPlayerName)
          .order("enacted_turn", { ascending: false }),
        supabase.from("declarations").select("*")
          .eq("session_id", sessionId)
          .eq("player_name", currentPlayerName)
          .eq("status", "published")
          .order("turn_number", { ascending: false })
          .limit(20),
      ]);
      setLaws(lawsRes.data || []);
      setDecrees(decreesRes.data || []);
    };
    fetchData();
  }, [sessionId, currentPlayerName, currentTurn]);

  const activeLaws = laws.filter(l => l.is_active);
  const repealedLaws = laws.filter(l => !l.is_active);

  return (
    <div className="space-y-3">
      {/* Active Laws */}
      <Card>
        <CardHeader className="p-3 pb-1 cursor-pointer" onClick={() => setExpanded(expanded === "laws" ? null : "laws")}>
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ScrollText className="h-3 w-3" />
              Aktivní zákony ({activeLaws.length})
            </span>
            {expanded === "laws" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </CardTitle>
        </CardHeader>
        {expanded === "laws" && (
          <CardContent className="p-3 pt-1 space-y-2">
            {activeLaws.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">Žádné aktivní zákony</p>
            )}
            {activeLaws.map(law => {
              const effects = Array.isArray(law.structured_effects) ? law.structured_effects : [];
              return (
                <div key={law.id} className="border border-border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-semibold text-xs">{law.law_name}</span>
                    <span className="text-[9px] text-muted-foreground">Rok {law.enacted_turn}</span>
                  </div>
                  {law.ai_epic_text && (
                    <p className="text-[10px] italic text-muted-foreground mb-1 line-clamp-2">{law.ai_epic_text}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {effects.map((e: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[9px] py-0">
                        {EFFECT_LABELS[e.type] || e.type}: {e.value > 0 ? "+" : ""}{e.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
            {repealedLaws.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">
                + {repealedLaws.length} zrušených zákonů
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Decrees */}
      <Card>
        <CardHeader className="p-3 pb-1 cursor-pointer" onClick={() => setExpanded(expanded === "decrees" ? null : "decrees")}>
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Megaphone className="h-3 w-3" />
              Přijaté dekrety ({decrees.length})
            </span>
            {expanded === "decrees" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </CardTitle>
        </CardHeader>
        {expanded === "decrees" && (
          <CardContent className="p-3 pt-1 space-y-2">
            {decrees.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">Žádné dekrety</p>
            )}
            {decrees.map(d => {
              const effects = Array.isArray(d.effects) ? d.effects : [];
              return (
                <div key={d.id} className="border border-border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-semibold text-xs truncate max-w-[200px]">{d.title || d.declaration_type}</span>
                    <Badge variant="secondary" className="text-[9px]">Rok {d.turn_number}</Badge>
                  </div>
                  {d.epic_text ? (
                    <p className="text-[10px] italic text-muted-foreground line-clamp-2">{d.epic_text}</p>
                  ) : d.original_text ? (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{d.original_text}</p>
                  ) : null}
                  {effects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {effects.map((e: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[9px] py-0">
                          {e.label || e.type}: {e.value > 0 ? "+" : ""}{e.value}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default RealmLawsDecrees;
