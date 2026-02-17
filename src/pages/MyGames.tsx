import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Crown, Plus, Users, LogOut, Scroll } from "lucide-react";
import { toast } from "sonner";
import WorldSetupWizard from "@/components/WorldSetupWizard";

interface GameMembership {
  id: string;
  session_id: string;
  player_name: string;
  role: string;
  joined_at: string;
  game_sessions: {
    id: string;
    room_code: string;
    current_turn: number;
    current_era: string;
  } | null;
  world_foundations?: {
    world_name: string;
  } | null;
}

const MyGames = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [memberships, setMemberships] = useState<GameMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joining, setJoining] = useState(false);

  const fetchGames = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("game_memberships")
      .select("*, game_sessions(id, room_code, current_turn, current_era)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });
    if (data) setMemberships(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchGames(); }, [user]);
  useEffect(() => { if (profile) setPlayerName(profile.username); }, [profile]);

  const handleJoinGame = async () => {
    if (!joinCode.trim() || !playerName.trim() || !user) { toast.error("Vyplňte všechna pole"); return; }
    setJoining(true);

    // Find session by code
    const { data: session } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("room_code", joinCode.toUpperCase())
      .single();

    if (!session) { toast.error("Hra nenalezena"); setJoining(false); return; }

    // Check if already member
    const { data: existing } = await supabase
      .from("game_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("session_id", session.id)
      .single();

    if (existing) {
      navigate(`/game/${session.id}`);
      setJoining(false);
      return;
    }

    // Check player count
    const { data: players } = await supabase
      .from("game_players")
      .select("*")
      .eq("session_id", session.id);

    const count = players?.length || 0;
    if (count >= session.max_players) { toast.error("Hra je plná"); setJoining(false); return; }

    // Add player + membership
    await supabase.from("game_players").insert({
      session_id: session.id,
      player_name: playerName.trim(),
      player_number: count + 1,
      user_id: user.id,
    });

    await supabase.from("game_memberships").insert({
      user_id: user.id,
      session_id: session.id,
      player_name: playerName.trim(),
      role: "player",
    });

    // Init resources
    for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
      await supabase.from("player_resources").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        resource_type: rt,
        income: rt === "food" ? 4 : rt === "wood" ? 3 : rt === "stone" ? 2 : rt === "iron" ? 1 : 2,
        upkeep: rt === "food" ? 2 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
        stockpile: rt === "food" ? 10 : rt === "wood" ? 5 : rt === "stone" ? 3 : rt === "iron" ? 2 : 5,
      });
    }

    toast.success("Připojeno ke hře!");
    navigate(`/game/${session.id}`);
    setJoining(false);
  };

  const handleGameCreated = (sessionId: string) => {
    setShowCreate(false);
    navigate(`/game/${sessionId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment-bg">
        <Scroll className="h-12 w-12 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen parchment-bg">
      <header className="imperial-header sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6 text-illuminated" />
            <h1 className="font-decorative font-bold text-lg">Chronicle Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{profile?.username}</span>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Moje hry</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowJoin(true)}>
              <Users className="mr-2 h-4 w-4" />Připojit se
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />Nová hra
            </Button>
          </div>
        </div>

        {/* Join Game */}
        {showJoin && (
          <div className="bg-card p-5 rounded-lg border border-border shadow-parchment space-y-3">
            <h3 className="font-display font-semibold">Připojit se ke hře</h3>
            <Input placeholder="Vaše jméno v této hře" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            <Input placeholder="Kód místnosti (např. A3K9F2)" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="font-mono tracking-widest" maxLength={6} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowJoin(false)}>Zrušit</Button>
              <Button onClick={handleJoinGame} disabled={joining}>{joining ? "Připojuji..." : "Vstoupit"}</Button>
            </div>
          </div>
        )}

        {/* Create Game (World Setup Wizard) */}
        {showCreate && (
          <WorldSetupWizard
            userId={user!.id}
            defaultPlayerName={profile?.username || "Hráč"}
            onCreated={handleGameCreated}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* Games List */}
        {memberships.length === 0 && !showCreate && !showJoin ? (
          <div className="text-center py-12 space-y-3">
            <Scroll className="h-16 w-16 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Zatím nemáte žádné hry.</p>
            <p className="text-sm text-muted-foreground">Založte novou hru nebo se připojte kódem.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {memberships.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/game/${m.session_id}`)}
                className="w-full text-left bg-card p-4 rounded-lg border border-border shadow-parchment hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display font-semibold">{m.player_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Kód: {m.game_sessions?.room_code} · Rok {m.game_sessions?.current_turn}
                    </p>
                  </div>
                  <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                    {m.role === "admin" ? "👑 Admin" : "⚔️ Hráč"}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyGames;
