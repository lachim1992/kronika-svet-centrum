import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, User, Home, LogOut, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";

interface OtherGame {
  session_id: string;
  player_name: string;
  world_name?: string;
  current_turn?: number;
}

interface Props {
  roomCode: string;
  currentTurn: number;
  worldName?: string;
  playerName: string;
  myRole: string;
  currentSessionId?: string;
}

const AppHeader = ({ roomCode, currentTurn, worldName, playerName, myRole, currentSessionId }: Props) => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [otherGames, setOtherGames] = useState<OtherGame[]>([]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success(`Kód ${roomCode} zkopírován`);
  };

  useEffect(() => {
    if (!user || !currentSessionId) return;
    const load = async () => {
      const { data } = await supabase
        .from("game_memberships")
        .select("session_id, player_name, game_sessions(id, current_turn)")
        .eq("user_id", user.id)
        .neq("session_id", currentSessionId)
        .order("joined_at", { ascending: false })
        .limit(5);
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
          world_name: wf?.world_name,
          current_turn: m.game_sessions.current_turn,
        });
      }
      setOtherGames(results);
    };
    load();
  }, [user, currentSessionId]);

  return (
    <header className="sticky top-0 z-40 border-b border-border backdrop-blur-md"
      style={{ background: "hsl(220 28% 7% / 0.95)", boxShadow: "0 2px 16px -4px hsl(220 30% 3% / 0.6)" }}
    >
      <div className="flex items-center justify-between px-5 py-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-4 min-w-0">
          <ChronicleHubLogo variant="mark" size="sm" />
          <span className="font-display font-semibold text-base text-primary truncate">
            {worldName || "The Chronicle Hub"}
          </span>
          <Badge className="bg-primary/15 text-primary border-primary/25 font-display text-xs shrink-0 px-3 py-1">
            Rok {currentTurn}
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={copyCode} className="font-mono text-xs h-8 px-3 text-muted-foreground hover:text-foreground">
            <Copy className="h-3.5 w-3.5 mr-1.5" />{roomCode}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 px-3 rounded-lg bg-secondary border border-border hover:bg-secondary/80 hover:border-primary/20 transition-all duration-200 flex items-center gap-2 text-sm font-display">
                <User className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold max-w-[100px] truncate">{playerName}</span>
                {myRole === "admin" && <span className="text-xs text-primary">★</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-display">
                <div className="flex flex-col">
                  <span>{playerName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {myRole === "admin" ? "Správce" : "Hráč"} · {worldName || roomCode}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {otherGames.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Přepnout hru
                  </DropdownMenuLabel>
                  {otherGames.map(g => (
                    <DropdownMenuItem key={g.session_id} onClick={() => navigate(`/game/${g.session_id}`)}>
                      <Globe className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm">{g.world_name || "Hra"}</span>
                        <span className="text-[10px] text-muted-foreground">Rok {g.current_turn} · {g.player_name}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem onClick={() => navigate("/")}>
                <Home className="mr-2 h-4 w-4" />
                Hlavní menu
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Odhlásit se
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
