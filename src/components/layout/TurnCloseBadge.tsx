import { useState } from "react";
import { Users, Lock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Player {
  id: string;
  player_name: string;
  player_number: number;
  turn_closed: boolean;
}

interface Props {
  players: Player[];
  sessionId: string;
  currentTurn: number;
  isAdmin: boolean;
  turnProcessing: boolean;
}

const TurnCloseBadge = ({ players, sessionId, currentTurn, isAdmin, turnProcessing }: Props) => {
  const [forcing, setForcing] = useState<string | null>(null);

  const closedCount = players.filter(p => p.turn_closed).length;
  const totalCount = players.length;
  const allClosed = totalCount > 0 && closedCount === totalCount;

  const handleForceClose = async (player: Player) => {
    setForcing(player.id);
    try {
      await supabase
        .from("game_players")
        .update({ turn_closed: true })
        .eq("id", player.id);

      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: "Admin",
        turn_number: currentTurn,
        action_type: "other",
        description: `Admin vynutil uzavření kola pro ${player.player_name}`,
      });

      toast.success(`Kolo pro ${player.player_name} vynuceně uzavřeno.`);
    } catch {
      toast.error("Chyba při vynucení uzavření.");
    } finally {
      setForcing(null);
    }
  };

  if (totalCount <= 1) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-8 px-2.5 rounded-md bg-secondary border border-border hover:bg-secondary/80 transition-all duration-200 flex items-center gap-1.5 text-xs font-display">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={allClosed ? "text-primary font-semibold" : "text-muted-foreground"}>
            {closedCount}/{totalCount}
          </span>
          {turnProcessing && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-display font-semibold mb-2 text-muted-foreground">
          Uzavření kola {currentTurn}
        </p>
        <div className="space-y-1.5">
          {players.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${p.turn_closed ? "bg-primary" : "bg-muted-foreground/40"}`} />
                <span className={p.turn_closed ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {p.player_name}
                </span>
              </div>
              {p.turn_closed ? (
                <Badge variant="default" className="text-[10px] h-5 px-1.5">Hotovo</Badge>
              ) : isAdmin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                  onClick={() => handleForceClose(p)}
                  disabled={!!forcing}
                >
                  {forcing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Lock className="h-3 w-3 mr-1" />Vynutit</>}
                </Button>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">Čeká</Badge>
              )}
            </div>
          ))}
        </div>
        {turnProcessing && (
          <p className="text-[10px] text-primary mt-2 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Zpracovávám další kolo…
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default TurnCloseBadge;
