import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, BookOpen, Feather, User, Home, LogOut, Settings, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

/** Simple SVG logo: open book + quill + compass star */
const ChronicleLogo = () => (
  <div className="flex items-center gap-1.5 shrink-0">
    <div className="relative w-7 h-7 flex items-center justify-center">
      <BookOpen className="h-5 w-5 text-primary" strokeWidth={1.8} />
      <Feather className="h-3 w-3 text-primary absolute -top-0.5 -right-0.5 rotate-45" strokeWidth={2} />
      <svg className="absolute -bottom-0.5 -right-1 w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
        <path d="M6 0L7.2 4.8L12 6L7.2 7.2L6 12L4.8 7.2L0 6L4.8 4.8Z" fill="hsl(var(--primary))" opacity="0.7" />
      </svg>
    </div>
  </div>
);

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
    <header className="imperial-header sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-2.5 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <ChronicleLogo />
          <span className="font-decorative font-bold text-sm truncate">
            {worldName || "Chronicle Hub"}
          </span>
          <Badge variant="secondary" className="font-display text-xs shrink-0">Rok {currentTurn}</Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={copyCode} className="font-mono text-xs h-7 px-2">
            <Copy className="h-3 w-3 mr-1" />{roomCode}
          </Button>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 px-2.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5 text-sm font-display">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold max-w-[80px] truncate">{playerName}</span>
                {myRole === "admin" && <span className="text-[10px]">👑</span>}
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
