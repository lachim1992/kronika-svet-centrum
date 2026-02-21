import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Users, LogOut, Scroll,
  Clock, RotateCcw, Bot, Pen, UserPlus, Server,
} from "lucide-react";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";
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
    game_mode: string;
  } | null;
}

interface WorldFoundation {
  session_id: string;
  world_name: string;
}

const MODE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  tb_single_ai: { label: "AI Svět", color: "bg-primary/15 text-primary border-primary/30", icon: Bot },
  tb_single_manual: { label: "Ruční", color: "bg-accent/15 text-accent border-accent/30", icon: Pen },
  tb_multi: { label: "Multiplayer", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", icon: UserPlus },
  time_persistent: { label: "Persistent", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30", icon: Server },
};

const getModeMeta = (mode?: string) => {
  if (!mode || !MODE_META[mode]) return { label: "Legacy", color: "bg-muted text-muted-foreground border-border", icon: RotateCcw };
  return MODE_META[mode];
};

/* Logo moved to ChronicleHubLogo component */

const MyGames = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [memberships, setMemberships] = useState<GameMembership[]>([]);
  const [worldNames, setWorldNames] = useState<Record<string, string>>({});
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
      .select("*, game_sessions(id, room_code, current_turn, current_era, game_mode)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });
    if (data) {
      setMemberships(data as any);
      // Fetch world names for all sessions
      const sessionIds = data.map((m: any) => m.session_id);
      if (sessionIds.length > 0) {
        const { data: wfData } = await supabase
          .from("world_foundations")
          .select("session_id, world_name")
          .in("session_id", sessionIds);
        if (wfData) {
          const map: Record<string, string> = {};
          for (const wf of wfData as WorldFoundation[]) {
            map[wf.session_id] = wf.world_name;
          }
          setWorldNames(map);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchGames(); }, [user]);
  useEffect(() => { if (profile) setPlayerName(profile.username); }, [profile]);

  const handleJoinGame = async () => {
    if (!joinCode.trim() || !playerName.trim() || !user) { toast.error("Vyplňte všechna pole"); return; }
    setJoining(true);

    const { data: session } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("room_code", joinCode.toUpperCase())
      .single();

    if (!session) { toast.error("Hra nenalezena"); setJoining(false); return; }

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

    const { data: players } = await supabase
      .from("game_players")
      .select("*")
      .eq("session_id", session.id);

    const count = players?.length || 0;
    if (count >= session.max_players) { toast.error("Hra je plná"); setJoining(false); return; }

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Scroll className="h-12 w-12 text-primary animate-pulse" />
      </div>
    );
  }

  // Group memberships by mode category
  const turnBasedGames = memberships.filter(m => {
    const mode = m.game_sessions?.game_mode;
    return !mode || mode.startsWith("tb_");
  });
  const persistentGames = memberships.filter(m => m.game_sessions?.game_mode === "time_persistent");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="imperial-header sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 max-w-3xl mx-auto">
          <ChronicleHubLogo variant="full" size="sm" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{profile?.username}</span>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">

        {/* ====== SECTION A: My Worlds ====== */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Scroll className="h-5 w-5 text-primary" />
              Moje světy
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowJoin(true)}>
              <Users className="mr-2 h-4 w-4" />Připojit se
            </Button>
          </div>

          {/* Join Game inline */}
          {showJoin && (
            <div className="bg-card p-5 rounded-md border border-border space-y-3 mb-4">
              <h3 className="font-display font-semibold">Připojit se ke hře</h3>
              <Input placeholder="Vaše jméno v této hře" value={playerName} onChange={e => setPlayerName(e.target.value)} />
              <Input placeholder="Kód místnosti (např. A3K9F2)" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="font-mono tracking-widest" maxLength={6} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowJoin(false)}>Zrušit</Button>
                <Button onClick={handleJoinGame} disabled={joining}>{joining ? "Připojuji..." : "Vstoupit"}</Button>
              </div>
            </div>
          )}

          {memberships.length === 0 && !showCreate && !showJoin ? (
            <div className="text-center py-10 space-y-2 bg-card/50 rounded-lg border border-dashed border-border">
              <Scroll className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground font-display">Zatím nemáte žádné světy.</p>
              <p className="text-sm text-muted-foreground">Založte nový svět nebo se připojte kódem.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Turn-Based games */}
              {turnBasedGames.length > 0 && (
                <div className="space-y-2">
                  {turnBasedGames.length > 0 && persistentGames.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">Tahové hry</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  {turnBasedGames.map(m => (
                    <GameCard key={m.id} membership={m} worldName={worldNames[m.session_id]} onNavigate={() => navigate(`/game/${m.session_id}`)} />
                  ))}
                </div>
              )}

              {/* Persistent games */}
              {persistentGames.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pt-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">Persistentní světy</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {persistentGames.map(m => (
                    <GameCard key={m.id} membership={m} worldName={worldNames[m.session_id]} onNavigate={() => navigate(`/game/${m.session_id}`)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ====== SECTION B: Create New World ====== */}
        <section>
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full p-5 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-all group"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-display font-bold text-lg text-foreground">Založit nový svět</p>
                  <p className="text-sm text-muted-foreground">Turn-Based · AI Svět · Multiplayer · Persistent Server</p>
                </div>
              </div>
            </button>
          ) : (
            <WorldSetupWizard
              userId={user!.id}
              defaultPlayerName={profile?.username || "Hráč"}
              onCreated={handleGameCreated}
              onCancel={() => setShowCreate(false)}
            />
          )}
        </section>
      </main>
    </div>
  );
};

/** Individual game card with mode badge */
const GameCard = ({ membership: m, worldName, onNavigate }: {
  membership: GameMembership;
  worldName?: string;
  onNavigate: () => void;
}) => {
  const meta = getModeMeta(m.game_sessions?.game_mode);
  const Icon = meta.icon;

  return (
    <button
      onClick={onNavigate}
      className="w-full text-left bg-card p-4 rounded-md border border-border hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-display font-semibold truncate">
              {worldName || m.player_name}
            </p>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.color}`}>
              <Icon className="h-3 w-3 mr-1" />
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {worldName ? `${m.player_name} · ` : ""}Kód: {m.game_sessions?.room_code} · Rok {m.game_sessions?.current_turn}
          </p>
        </div>
        <Badge variant={m.role === "admin" ? "default" : "secondary"} className="shrink-0">
          {m.role === "admin" ? "👑 Admin" : "⚔️ Hráč"}
        </Badge>
      </div>
    </button>
  );
};

export default MyGames;
