import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Home, Plus, Users, Crown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OtherGame {
  session_id: string;
  player_name: string;
  role: string;
  world_name?: string;
  room_code?: string;
  current_turn?: number;
}

interface Props {
  currentSessionId: string;
  worldName?: string;
  currentTurn: number;
  playerName: string;
}

const GameHubFAB = ({ currentSessionId, worldName, currentTurn, playerName }: Props) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [games, setGames] = useState<OtherGame[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("game_memberships")
        .select("session_id, player_name, role, game_sessions(id, room_code, current_turn)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      if (!data) return;
      const results: OtherGame[] = [];
      for (const m of data as any[]) {
        if (!m.game_sessions) continue;
        const { data: wf } = await supabase
          .from("world_foundations")
          .select("world_name")
          .eq("session_id", m.session_id)
          .maybeSingle();
        results.push({
          session_id: m.session_id,
          player_name: m.player_name,
          role: m.role,
          world_name: wf?.world_name,
          room_code: m.game_sessions.room_code,
          current_turn: m.game_sessions.current_turn,
        });
      }
      setGames(results);
    };
    fetch();
  }, [user, open]);

  const otherGames = games.filter(g => g.session_id !== currentSessionId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="Game Hub"
        >
          <Globe className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Game Hub</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Current game */}
          <div className="bg-accent/50 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-sm">Aktuální hra</span>
            </div>
            <p className="font-display font-bold">{worldName || "Bez názvu"}</p>
            <p className="text-xs text-muted-foreground">Rok {currentTurn} · {playerName}</p>
          </div>

          {/* Other games */}
          {otherGames.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Přepnout hru</p>
              {otherGames.map(g => (
                <button
                  key={g.session_id}
                  onClick={() => { setOpen(false); navigate(`/game/${g.session_id}`); }}
                  className="w-full text-left bg-card p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <p className="font-display font-semibold text-sm">{g.world_name || g.room_code}</p>
                  <p className="text-xs text-muted-foreground">Rok {g.current_turn} · {g.player_name}</p>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => { setOpen(false); navigate("/"); }} className="h-11">
              <Home className="mr-2 h-4 w-4" />
              Hlavní menu
            </Button>
            <Button variant="outline" onClick={() => { setOpen(false); signOut(); }} className="h-11 text-destructive border-destructive/30 hover:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              Odhlásit se
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GameHubFAB;
