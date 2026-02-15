import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGameSession, joinGameSession } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scroll, Users, Swords } from "lucide-react";
import { toast } from "sonner";

const LandingPage = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    setLoading(true);
    const session = await createGameSession(playerName.trim());
    setLoading(false);
    if (session) {
      localStorage.setItem("ch_player", "player1");
      localStorage.setItem("ch_playerName", playerName.trim());
      navigate(`/game/${session.id}`);
    } else {
      toast.error("Nepodařilo se vytvořit hru");
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !roomCode.trim()) { toast.error("Vyplňte všechna pole"); return; }
    setLoading(true);
    const session = await joinGameSession(roomCode.trim(), playerName.trim());
    setLoading(false);
    if (session) {
      localStorage.setItem("ch_player", "player2");
      localStorage.setItem("ch_playerName", playerName.trim());
      navigate(`/game/${session.id}`);
    } else {
      toast.error("Herní místnost nenalezena");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 parchment-bg">
      <div className="max-w-md w-full space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Scroll className="h-10 w-10 text-primary" />
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-wide">
              Chronicle Hub
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-body">
            Společník pro civilizační deskovou hru
          </p>
        </div>

        {mode === "menu" && (
          <div className="space-y-4">
            <Button
              onClick={() => setMode("create")}
              className="w-full h-14 text-lg font-display"
              size="lg"
            >
              <Swords className="mr-3 h-5 w-5" />
              Vytvořit novou hru
            </Button>
            <Button
              onClick={() => setMode("join")}
              variant="outline"
              className="w-full h-14 text-lg font-display"
              size="lg"
            >
              <Users className="mr-3 h-5 w-5" />
              Připojit se ke hře
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4 bg-card p-6 rounded-lg shadow-parchment border border-border">
            <h2 className="text-xl font-display font-semibold">Nová hra</h2>
            <Input
              placeholder="Vaše jméno (např. Hráč 1)"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="h-12 text-base"
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setMode("menu")} className="flex-1">
                Zpět
              </Button>
              <Button onClick={handleCreate} disabled={loading} className="flex-1 font-display">
                {loading ? "Vytváření..." : "Založit hru"}
              </Button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4 bg-card p-6 rounded-lg shadow-parchment border border-border">
            <h2 className="text-xl font-display font-semibold">Připojit se</h2>
            <Input
              placeholder="Vaše jméno"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="h-12 text-base"
            />
            <Input
              placeholder="Kód místnosti (např. A3K9F2)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="h-12 text-base font-mono tracking-widest"
              maxLength={6}
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setMode("menu")} className="flex-1">
                Zpět
              </Button>
              <Button onClick={handleJoin} disabled={loading} className="flex-1 font-display">
                {loading ? "Připojování..." : "Vstoupit"}
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Zaznamenejte dějiny své civilizace ⚔️
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
