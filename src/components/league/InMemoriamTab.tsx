import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skull, Loader2, BookOpen, Sparkles, ImageIcon, RefreshCw, Pencil, Save, X, History } from "lucide-react";
import { toast } from "sonner";
import { isElevatedRole } from "@/lib/permissions";
import MemoriamCard from "./MemoriamCard";

export interface DeadPlayer {
  id: string;
  name: string;
  position: string;
  goals_scored: number;
  matches_played: number;
  birth_turn: number;
  death_turn: number;
  death_cause: string;
  portrait_url: string | null;
  bio: string | null;
  team_id: string;
  team_name: string;
  city_name: string;
  owner_player: string;
  color_primary: string;
  match_id?: string;
  match_round?: number;
  match_opponent?: string;
  match_score?: string;
  death_minute?: number;
  killer_name?: string;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole?: string;
  onEntityClick?: (type: string, id: string, name: string) => void;
}

export const POS_FULL: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
  goalkeeper: "Praetor", defender: "Strážce", midfielder: "Nositel", attacker: "Útočník",
};

export default function InMemoriamTab({ sessionId, currentPlayerName, myRole, onEntityClick }: Props) {
  const [deadPlayers, setDeadPlayers] = useState<DeadPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = isElevatedRole(myRole || "player");

  const fetchDead = useCallback(async () => {
    setLoading(true);
    const { data: dead } = await supabase
      .from("league_players")
      .select("id, name, position, goals_scored, matches_played, birth_turn, death_turn, death_cause, portrait_url, bio, team_id")
      .eq("session_id", sessionId)
      .eq("is_dead", true)
      .order("death_turn", { ascending: false });

    if (!dead || dead.length === 0) { setDeadPlayers([]); setLoading(false); return; }

    const teamIds = [...new Set(dead.map(d => d.team_id))];
    const { data: teams } = await supabase
      .from("league_teams")
      .select("id, team_name, city_id, player_name, color_primary")
      .in("id", teamIds);
    const teamMap = new Map((teams || []).map(t => [t.id, t]));

    const cityIds = [...new Set((teams || []).map(t => t.city_id).filter(Boolean))];
    const { data: cities } = await supabase
      .from("cities")
      .select("id, name")
      .in("id", cityIds);
    const cityMap = new Map((cities || []).map(c => [c.id, c.name]));

    const deathTurns = [...new Set(dead.map(d => d.death_turn).filter(Boolean))];
    const { data: matchesData } = await supabase
      .from("league_matches")
      .select("id, round_number, home_team_id, away_team_id, home_score, away_score, match_events, played_turn")
      .eq("session_id", sessionId)
      .eq("status", "played")
      .in("played_turn", deathTurns);

    const enriched: DeadPlayer[] = dead.map(d => {
      const team = teamMap.get(d.team_id);
      const cityName = team ? (cityMap.get(team.city_id) || "?") : "?";
      
      const result: DeadPlayer = {
        ...d,
        team_name: team?.team_name || "?",
        city_name: cityName,
        owner_player: team?.player_name || "?",
        color_primary: team?.color_primary || "#666",
      };

      if (matchesData && d.death_turn) {
        for (const match of matchesData) {
          if (match.played_turn !== d.death_turn) continue;
          if (match.home_team_id !== d.team_id && match.away_team_id !== d.team_id) continue;
          
          const events = Array.isArray(match.match_events) ? match.match_events : [];
          const deathEvent = events.find((e: any) =>
            e.type === "injury" && e.is_death === true && e.player_id === d.id
          );
          
          if (deathEvent || match.home_team_id === d.team_id || match.away_team_id === d.team_id) {
            const opponentId = match.home_team_id === d.team_id ? match.away_team_id : match.home_team_id;
            const opponent = teamMap.get(opponentId);
            const isHome = match.home_team_id === d.team_id;
            result.match_id = match.id;
            result.match_round = match.round_number;
            result.match_opponent = opponent?.team_name || "?";
            result.match_score = isHome
              ? `${match.home_score}:${match.away_score}`
              : `${match.away_score}:${match.home_score}`;
            
            if (deathEvent) {
              result.death_minute = (deathEvent as any).minute;
              const eventsArr = Array.isArray(match.match_events) ? match.match_events : [];
              const knockoutEvent = eventsArr.find((e: any) =>
                e.type === "knockout" && e.victim_id === d.id
              );
              if (knockoutEvent) result.killer_name = (knockoutEvent as any).player_name;
            }
            break;
          }
        }
      }
      return result;
    });

    setDeadPlayers(enriched);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchDead(); }, [fetchDead]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (deadPlayers.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <Skull className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aréna si zatím nevyžádala žádné oběti.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Smrt přichází s brutálními zápasy Sphaery.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-border bg-card/50 border-t-2 border-t-red-900/40">
        <CardHeader className="py-2 px-3 border-b border-border/50">
          <CardTitle className="text-xs font-display flex items-center gap-2">
            <Skull className="h-4 w-4 text-red-400" />
            In Memoriam — Padlí hrdinové Sphaery
            <Badge variant="secondary" className="text-[9px]">{deadPlayers.length} obětí</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[80vh] overflow-y-auto">
            <div className="divide-y divide-border/30">
              {deadPlayers.map(p => (
                <MemoriamCard
                  key={p.id}
                  player={p}
                  sessionId={sessionId}
                  currentPlayerName={currentPlayerName}
                  isAdmin={isAdmin}
                  onEntityClick={onEntityClick}
                  onRefresh={fetchDead}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
