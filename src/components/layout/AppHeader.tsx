import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Copy, ChevronDown, Home, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface Props {
  roomCode: string;
  currentTurn: number;
  worldName?: string;
  playerName: string;
  myRole: string;
}

interface OtherGame {
  session_id: string;
  player_name: string;
  role: string;
  world_name?: string;
  room_code?: string;
  current_turn?: number;
}

const AppHeader = ({ roomCode, currentTurn, worldName, playerName, myRole }: Props) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [otherGames, setOtherGames] = useState<OtherGame[]>([]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success(`Kód ${roomCode} zkopírován`);
  };

  useEffect(() => {
    if (!user) return;
    const fetchGames = async () => {
      const { data } = await supabase
        .from("game_memberships")
        .select("session_id, player_name, role, game_sessions(id, room_code, current_turn)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      if (data) {
        const games: OtherGame[] = [];
        for (const m of data as any[]) {
          const sess = m.game_sessions;
          if (!sess) continue;
          // fetch world name
          const { data: wf } = await supabase
            .from("world_foundations")
            .select("world_name")
            .eq("session_id", m.session_id)
            .maybeSingle();
          games.push({
            session_id: m.session_id,
            player_name: m.player_name,
            role: m.role,
            world_name: wf?.world_name,
            room_code: sess.room_code,
            current_turn: sess.current_turn,
          });
        }
        setOtherGames(games);
      }
    };
    fetchGames();
  }, [user]);

  const currentSessionId = window.location.pathname.split("/game/")[1];

  return (
    <header className="imperial-header sticky top-0 z-40">
      <div className="flex items-center justify-between px-3 py-2 max-w-[1600px] mx-auto">
        {/* Left: Game switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-1.5 min-w-0 max-w-[55%] px-2 h-8">
              <Crown className="h-4 w-4 text-illuminated shrink-0" />
              <span className="font-decorative font-bold text-sm truncate">
                {worldName || "Chronicle Hub"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Aktuální hra</DropdownMenuLabel>
            <div className="px-2 py-1.5">
              <p className="font-display font-semibold text-sm">{worldName || "Bez názvu"}</p>
              <p className="text-xs text-muted-foreground">Rok {currentTurn} · {playerName} · {roomCode}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Přepnout hru</DropdownMenuLabel>
            {otherGames
              .filter(g => g.session_id !== currentSessionId)
              .map(g => (
                <DropdownMenuItem
                  key={g.session_id}
                  onClick={() => navigate(`/game/${g.session_id}`)}
                  className="flex flex-col items-start gap-0.5 cursor-pointer"
                >
                  <span className="font-display text-sm font-medium">{g.world_name || g.room_code}</span>
                  <span className="text-xs text-muted-foreground">
                    Rok {g.current_turn} · {g.player_name}
                  </span>
                </DropdownMenuItem>
              ))}
            {otherGames.filter(g => g.session_id !== currentSessionId).length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">Žádné další hry</div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/")} className="cursor-pointer">
              <Home className="mr-2 h-4 w-4" />
              Hlavní menu
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Odhlásit se
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right: turn + code */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary" className="font-display text-xs h-6">Rok {currentTurn}</Badge>
          <Button variant="ghost" size="sm" onClick={copyCode} className="font-mono text-xs h-7 px-2">
            <Copy className="h-3 w-3 mr-1" />{roomCode}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
