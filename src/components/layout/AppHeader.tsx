import { Crown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  roomCode: string;
  currentTurn: number;
  worldName?: string;
  playerName: string;
  myRole: string;
}

const AppHeader = ({ roomCode, currentTurn, worldName, playerName, myRole }: Props) => {
  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success(`Kód ${roomCode} zkopírován`);
  };

  return (
    <header className="imperial-header sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-2.5 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <Crown className="h-5 w-5 text-illuminated shrink-0" />
          <span className="font-decorative font-bold text-sm truncate">
            {worldName || "Chronicle Hub"}
          </span>
          <Badge variant="secondary" className="font-display text-xs shrink-0">Rok {currentTurn}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={copyCode} className="font-mono text-xs h-7 px-2">
            <Copy className="h-3 w-3 mr-1" />{roomCode}
          </Button>
          <Badge variant={myRole === "admin" ? "default" : "outline"} className="text-xs">
            {myRole === "admin" ? "👑" : "⚔️"} {playerName}
          </Badge>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
