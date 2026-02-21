import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createGameSession, joinGameSession } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scroll, Users, Swords } from "lucide-react";
import { toast } from "sonner";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";

const LandingPage = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);

  // Restore last game session — show skeleton, not landing
  useEffect(() => {
    const lastGameId = localStorage.getItem("ch_lastGameId");
    if (lastGameId) {
      navigate(`/game/${lastGameId}`, { replace: true });
    } else {
      setRestoring(false);
    }
  }, [navigate]);

  // Show loading skeleton while restoring
  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment-bg">
        <div className="text-center animate-fade-in">
          <Scroll className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="font-display text-lg text-muted-foreground">Obnovuji herní relaci...</p>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    setLoading(true);
    const session = await createGameSession(playerName.trim());
    setLoading(false);
    if (session) {
      localStorage.setItem("ch_playerName", playerName.trim());
      localStorage.setItem("ch_lastGameId", session.id);
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
      localStorage.setItem("ch_playerName", playerName.trim());
      localStorage.setItem("ch_lastGameId", session.id);
      navigate(`/game/${session.id}`);
    } else {
      toast.error("Herní místnost nenalezena nebo je plná");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "linear-gradient(180deg, hsl(220 30% 5%) 0%, hsl(220 30% 10%) 50%, hsl(220 25% 7%) 100%)" }}>
      <div className="max-w-md w-full space-y-8 animate-fade-in">
        <div className="text-center space-y-6 py-8">
          <ChronicleHubLogo variant="full" size="hero" />
        </div>

        <p className="text-muted-foreground text-base text-center" style={{ fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
          Kronikář vaší civilizace · 2–6 hráčů
        </p>

        {mode === "menu" && (
          <div className="space-y-4">
            <Button onClick={() => setMode("create")} className="w-full h-14 text-lg font-display" size="lg">
              <Swords className="mr-3 h-5 w-5" />
              Založit novou říši
            </Button>
            <Button onClick={() => setMode("join")} variant="outline" className="w-full h-14 text-lg font-display" size="lg">
              <Users className="mr-3 h-5 w-5" />
              Připojit se ke hře
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4 bg-card p-6 rounded-lg shadow-parchment border border-border">
            <h2 className="text-xl font-display font-semibold flex items-center gap-2">
              <Scroll className="h-5 w-5 text-primary" />
              Nová hra
            </h2>
            <Input
              placeholder="Jméno vaší civilizace / hráče"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="h-12 text-base"
            />
            <p className="text-xs text-muted-foreground">
              Další hráči se připojí kódem místnosti (až 6 hráčů).
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setMode("menu")} className="flex-1">Zpět</Button>
              <Button onClick={handleCreate} disabled={loading} className="flex-1 font-display">
                {loading ? "Zakládám..." : "⚔️ Založit říši"}
              </Button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4 bg-card p-6 rounded-lg shadow-parchment border border-border">
            <h2 className="text-xl font-display font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Připojit se
            </h2>
            <Input
              placeholder="Jméno vaší civilizace / hráče"
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
              <Button variant="outline" onClick={() => setMode("menu")} className="flex-1">Zpět</Button>
              <Button onClick={handleJoin} disabled={loading} className="flex-1 font-display">
                {loading ? "Připojuji..." : "Vstoupit do hry"}
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
