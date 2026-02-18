import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "@/hooks/useGameSession";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Scroll } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppHeader from "@/components/layout/AppHeader";
import BottomNav, { type TabId } from "@/components/layout/BottomNav";
import ActionChooser from "@/components/layout/ActionChooser";
import WorldEventDetailPanel from "@/components/WorldEventDetailPanel";
import HomeTab from "@/pages/game/HomeTab";
import WorldTab from "@/pages/game/WorldTab";
import RealmTab from "@/pages/game/RealmTab";
import ChronicleTab from "@/pages/game/ChronicleTab";
import CodexTab from "@/pages/game/CodexTab";
import ProfileTab from "@/pages/game/ProfileTab";

const Dashboard = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    session, events, memories, chronicles, cityStates, responses,
    players, cities, resources, armies, trades, wonders, entityTraits,
    civilizations, greatPersons, declarations, worldCrises, secretObjectives,
    loading, refetch,
  } = useGameSession(sessionId || null);

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [showActionChooser, setShowActionChooser] = useState(false);
  const [eventDetailId, setEventDetailId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("player");
  const [myPlayerName, setMyPlayerName] = useState("Hráč");
  const [worldFoundation, setWorldFoundation] = useState<any>(null);

  useEffect(() => {
    if (!user || !sessionId) return;

    const fetchMembership = async () => {
      const { data } = await supabase
        .from("game_memberships")
        .select("player_name, role")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .single();
      if (data) {
        setMyRole(data.role);
        setMyPlayerName(data.player_name);
      } else {
        setMyPlayerName(localStorage.getItem("ch_playerName") || "Hráč");
        setMyRole("admin");
      }
    };

    const fetchFoundation = async () => {
      const { data } = await supabase
        .from("world_foundations")
        .select("*")
        .eq("session_id", sessionId)
        .single();
      if (data) setWorldFoundation(data);
    };

    fetchMembership();
    fetchFoundation();
  }, [user, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment-bg">
        <div className="text-center animate-fade-in">
          <Scroll className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="font-display text-lg text-muted-foreground">Načítání herního světa...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment-bg">
        <div className="text-center space-y-4">
          <p className="font-display text-lg">Hra nenalezena</p>
          <Button onClick={() => navigate("/")}>Zpět na úvod</Button>
        </div>
      </div>
    );
  }

  const currentTurn = session.current_turn;

  const handleAction = (action: string) => {
    setActiveTab("chronicle");
  };

  const sharedProps = {
    sessionId: session.id,
    session,
    events, memories, chronicles, cityStates, responses, players, cities,
    resources, armies, trades, wonders, entityTraits, civilizations,
    greatPersons, declarations, worldCrises, secretObjectives,
    currentPlayerName: myPlayerName,
    currentTurn,
    myRole,
    worldFoundation,
    onRefetch: refetch,
    onEventClick: (id: string) => setEventDetailId(id),
  };

  return (
    <div className="min-h-screen parchment-bg">
      <AppHeader
        roomCode={session.room_code}
        currentTurn={currentTurn}
        worldName={worldFoundation?.world_name}
        playerName={myPlayerName}
        myRole={myRole}
      />

      <main className="max-w-[1600px] mx-auto px-3 py-3">
        {activeTab === "home" && <HomeTab {...sharedProps} />}
        {activeTab === "world" && <WorldTab {...sharedProps} />}
        {activeTab === "realm" && <RealmTab {...sharedProps} />}
        {activeTab === "chronicle" && <ChronicleTab {...sharedProps} />}
        {activeTab === "codex" && <CodexTab {...sharedProps} />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} onAddAction={() => setShowActionChooser(true)} />
      <ActionChooser open={showActionChooser} onClose={() => setShowActionChooser(false)} onAction={handleAction} />
      <WorldEventDetailPanel
        eventId={eventDetailId}
        open={!!eventDetailId}
        onClose={() => setEventDetailId(null)}
        onEventClick={(id) => setEventDetailId(id)}
      />
    </div>
  );
};

export default Dashboard;
