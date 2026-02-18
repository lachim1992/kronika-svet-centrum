import { Copy, BookOpen, Feather } from "lucide-react";
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

const AppHeader = ({ roomCode, currentTurn, worldName, playerName, myRole }: Props) => {
  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success(`Kód ${roomCode} zkopírován`);
  };

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
          <Badge variant={myRole === "admin" ? "default" : "outline"} className="text-xs">
            {myRole === "admin" ? "👑" : "⚔️"} {playerName}
          </Badge>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
