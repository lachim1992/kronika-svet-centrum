import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Swords, Zap, Crown, Flame } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface GameRecord {
  id: string;
  record_type: string;
  category: string;
  entity_name: string;
  player_name: string;
  portrait_url: string | null;
  title: string;
  description: string;
  discipline_name: string | null;
  festival_name: string | null;
  score: number | null;
  previous_record: number | null;
  margin: number | null;
  image_url: string | null;
  turn_number: number;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; accent: string }> = {
  discipline_record: { label: "Rekord", icon: <Trophy className="h-3.5 w-3.5" />, accent: "text-yellow-400 border-yellow-500/30" },
  close_match: { label: "Těsný souboj", icon: <Zap className="h-3.5 w-3.5" />, accent: "text-orange-400 border-orange-500/30" },
  dominant_win: { label: "Dominance", icon: <Crown className="h-3.5 w-3.5" />, accent: "text-purple-400 border-purple-500/30" },
  military_merit: { label: "Vojenská zásluha", icon: <Swords className="h-3.5 w-3.5" />, accent: "text-red-400 border-red-500/30" },
};

const HallOfRecords = ({ sessionId, currentPlayerName }: Props) => {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("game_records")
      .select("*")
      .eq("session_id", sessionId)
      .order("turn_number", { ascending: false });
    setRecords((data || []) as any);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Subscribe to realtime
  useEffect(() => {
    const ch = supabase
      .channel(`records-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_records", filter: `session_id=eq.${sessionId}` }, () => fetchRecords())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, fetchRecords]);

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám záznamy…</p>;

  const sportRecords = records.filter(r => r.category === "sports");
  const militaryRecords = records.filter(r => r.category === "military");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Flame className="h-4 w-4 text-primary" />
        <span className="font-display text-sm font-semibold">Síň slávy & Rekordů</span>
        <Badge variant="outline" className="text-[9px] ml-auto">{records.length} záznamů</Badge>
      </div>

      {records.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">Zatím žádné rekordy ani významné události.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Rekordy se automaticky zaznamenají po vyhodnocení her a bitev.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="space-y-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" className="text-[10px] font-display">Vše ({records.length})</TabsTrigger>
            <TabsTrigger value="sports" className="text-[10px] font-display">🏅 Sport ({sportRecords.length})</TabsTrigger>
            <TabsTrigger value="military" className="text-[10px] font-display">⚔ Vojenské ({militaryRecords.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all"><RecordList records={records} currentPlayerName={currentPlayerName} /></TabsContent>
          <TabsContent value="sports"><RecordList records={sportRecords} currentPlayerName={currentPlayerName} /></TabsContent>
          <TabsContent value="military"><RecordList records={militaryRecords} currentPlayerName={currentPlayerName} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
};

function RecordList({ records, currentPlayerName }: { records: GameRecord[]; currentPlayerName: string }) {
  if (records.length === 0) return <p className="text-xs text-muted-foreground text-center p-4">Žádné záznamy v této kategorii.</p>;

  return (
    <div className="space-y-3">
      {records.map(rec => {
        const cfg = TYPE_CONFIG[rec.record_type] || TYPE_CONFIG.discipline_record;
        const isOwn = rec.player_name === currentPlayerName;

        return (
          <Card key={rec.id} className={`border-border bg-card/50 overflow-hidden ${isOwn ? "ring-1 ring-primary/30" : ""}`}>
            {rec.image_url && (
              <div className="relative h-32 w-full overflow-hidden">
                <img
                  src={rec.image_url}
                  alt={rec.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                <div className="absolute bottom-2 left-3 flex items-center gap-2">
                  {rec.portrait_url && (
                    <img src={rec.portrait_url} alt="" className="w-8 h-8 rounded-full border-2 border-primary/50 object-cover" />
                  )}
                  <Badge variant="outline" className={`text-[8px] ${cfg.accent} bg-card/80 backdrop-blur-sm`}>
                    {cfg.icon}
                    <span className="ml-1">{cfg.label}</span>
                  </Badge>
                </div>
              </div>
            )}
            <CardContent className={`${rec.image_url ? "pt-2" : "pt-3"} pb-3 px-3`}>
              {!rec.image_url && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Badge variant="outline" className={`text-[8px] ${cfg.accent}`}>
                    {cfg.icon}
                    <span className="ml-1">{cfg.label}</span>
                  </Badge>
                </div>
              )}
              <h3 className="font-display text-xs font-semibold">{rec.title}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{rec.description}</p>

              <div className="flex items-center gap-2 mt-2 text-[9px] text-muted-foreground flex-wrap">
                <span className="font-semibold text-foreground">{rec.entity_name}</span>
                <span>({rec.player_name})</span>
                {rec.score != null && <span>Skóre: <span className="text-primary font-mono">{Number(rec.score).toFixed(1)}</span></span>}
                {rec.margin != null && (
                  <span>
                    {rec.record_type === "close_match" ? "Rozdíl:" : rec.record_type === "discipline_record" ? "Zlepšení:" : "Margin:"}
                    <span className="text-primary font-mono ml-0.5">{Number(rec.margin).toFixed(1)}</span>
                  </span>
                )}
                {rec.discipline_name && <span>📋 {rec.discipline_name}</span>}
                <span>Rok {rec.turn_number}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default HallOfRecords;
