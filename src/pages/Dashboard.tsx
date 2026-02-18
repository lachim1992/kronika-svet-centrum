import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "@/hooks/useGameSession";
import { useAuth } from "@/hooks/useAuth";
import { useEntityIndex } from "@/hooks/useEntityIndex";
import { supabase } from "@/integrations/supabase/client";
import { Scroll } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppHeader from "@/components/layout/AppHeader";
import BottomNav, { type TabId } from "@/components/layout/BottomNav";
import ActionChooser from "@/components/layout/ActionChooser";
import WorldEventDetailPanel from "@/components/WorldEventDetailPanel";
import GameHubFAB from "@/components/layout/GameHubFAB";
import HomeTab from "@/pages/game/HomeTab";
import WorldTab from "@/pages/game/WorldTab";
import RealmTab from "@/pages/game/RealmTab";
import FeedTab from "@/pages/game/FeedTab";
import CodexTab from "@/pages/game/CodexTab";
import ProfileTab from "@/pages/game/ProfileTab";
import DevTab from "@/pages/game/DevTab";

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

  const entityIndex = useEntityIndex(sessionId);

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [worldEntityTarget, setWorldEntityTarget] = useState<{ type: string; id: string } | null>(null);
  const [showActionChooser, setShowActionChooser] = useState(false);
  const [eventDetailId, setEventDetailId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("player");
  const [myPlayerName, setMyPlayerName] = useState("Hráč");
  const [worldFoundation, setWorldFoundation] = useState<any>(null);
  const [codexEntityTarget, setCodexEntityTarget] = useState<{ type: string; id: string } | null>(null);

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
    setActiveTab("feed");
  };

  const handleEntityClick = (type: string, id: string) => {
    if (type === "event") {
      setEventDetailId(id);
      return;
    }
    // Route to World or Codex depending on entity type
    if (["city", "province", "region"].includes(type)) {
      setWorldEntityTarget({ type, id });
      setActiveTab("world");
    } else {
      setCodexEntityTarget({ type, id });
      setActiveTab("codex");
    }
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
    entityIndex,
    onRefetch: refetch,
    onEventClick: (id: string) => setEventDetailId(id),
    onEntityClick: handleEntityClick,
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
        {activeTab === "world" && <WorldTab {...sharedProps} worldEntityTarget={worldEntityTarget} onClearWorldEntityTarget={() => setWorldEntityTarget(null)} />}
        {activeTab === "realm" && <RealmTab {...sharedProps} />}
        {activeTab === "feed" && <FeedTab {...sharedProps} />}
        {activeTab === "codex" && <CodexTab {...sharedProps} codexEntityTarget={codexEntityTarget} onClearEntityTarget={() => setCodexEntityTarget(null)} />}
        {activeTab === "dev" && myRole === "admin" && (
          <DevTab
            sessionId={session.id}
            currentPlayerName={myPlayerName}
            onRefetch={refetch}
            citiesCount={cities.length}
            eventsCount={events.length}
            wondersCount={wonders.length}
            memoriesCount={memories.length}
            playersCount={players.length}
          />
        )}
      </main>

      <GameHubFAB
        currentSessionId={session.id}
        worldName={worldFoundation?.world_name}
        currentTurn={currentTurn}
        playerName={myPlayerName}
      />
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} showDevTab={myRole === "admin"} />
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
