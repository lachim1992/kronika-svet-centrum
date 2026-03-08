import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Filter } from "lucide-react";
import RichText from "@/components/RichText";

interface ActionLogEntry {
  id: string;
  session_id: string;
  player_name: string;
  turn_number: number;
  action_type: string;
  description: string;
  metadata: any;
  created_at: string;
}

const ACTION_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  battle: { label: "Bitva", emoji: "⚔️" },
  build: { label: "Stavba", emoji: "🏗️" },
  diplomacy: { label: "Diplomacie", emoji: "🤝" },
  trade: { label: "Obchod", emoji: "💰" },
  event: { label: "Událost", emoji: "📋" },
  declaration: { label: "Vyhlášení", emoji: "📢" },
  upgrade: { label: "Upgrade", emoji: "⬆️" },
  other: { label: "Ostatní", emoji: "📝" },
};

interface Props {
  sessionId: string;
  currentTurn: number;
  myRole: string;
  entityIndex?: any;
  onEntityClick?: (type: string, id: string) => void;
}

const WorldActionLog = ({ sessionId, currentTurn, myRole, entityIndex, onEntityClick }: Props) => {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const [filterTurn, setFilterTurn] = useState<string>("all");
  const [players, setPlayers] = useState<string[]>([]);

  useEffect(() => {
    const fetchLog = async () => {
      let query = supabase
        .from("world_action_log")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });

      if (filterPlayer !== "all") query = query.eq("player_name", filterPlayer);
      if (filterTurn !== "all") query = query.eq("turn_number", parseInt(filterTurn));

      const { data } = await query;
      if (data) {
        setEntries(data as ActionLogEntry[]);
        const uniquePlayers = [...new Set(data.map(e => e.player_name))];
        setPlayers(uniquePlayers);
      }
    };
    fetchLog();
  }, [sessionId, filterPlayer, filterTurn]);

  if (myRole !== "admin" && myRole) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground italic">Přístup pouze pro Admina.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          📜 World Action Log
        </h3>
        <Badge variant="outline" className="text-xs">{entries.length} záznamů</Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <Select value={filterPlayer} onValueChange={setFilterPlayer}>
          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni</SelectItem>
            {players.filter(p => p && p.trim() !== "").map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTurn} onValueChange={setFilterTurn}>
          <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vše</SelectItem>
            {Array.from({ length: currentTurn }, (_, i) => i + 1).map(t => (
              <SelectItem key={t} value={String(t)}>Rok {t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log Entries */}
      <div className="space-y-1 max-h-[50vh] overflow-y-auto text-xs">
        {entries.length === 0 && (
          <p className="text-muted-foreground italic text-center py-4 text-sm">Žádné záznamy.</p>
        )}
        {entries.map(entry => {
          const typeInfo = ACTION_TYPE_LABELS[entry.action_type] || ACTION_TYPE_LABELS.other;
          return (
            <div key={entry.id} className="flex items-start gap-2 p-2 rounded border border-border bg-card">
              <span>{typeInfo.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold">{entry.player_name}</span>
                  <Badge variant="outline" className="text-[10px] h-4">{typeInfo.label}</Badge>
                  <span className="text-muted-foreground">Rok {entry.turn_number}</span>
                </div>
                <RichText text={entry.description} entityIndex={entityIndex} onEntityClick={onEntityClick} className="text-muted-foreground mt-0.5" />
              </div>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(entry.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorldActionLog;
