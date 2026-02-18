import { useState, useEffect, useCallback } from "react";
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
import WorldTab from "@/pages/game/WorldTab";
import CivTab from "@/pages/game/CivTab";
import CitiesTab from "@/pages/game/CitiesTab";
import FeedTab from "@/pages/game/FeedTab";
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

  const [activeTab, setActiveTab] = useState<TabId>("world");
  const [showActionChooser, setShowActionChooser] = useState(false);
  const [eventDetailId, setEventDetailId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("player");
  const [myPlayerName, setMyPlayerName] = useState("Hráč");
  const [worldFoundation, setWorldFoundation] = useState<any>(null);

  // Fetch membership & world foundation
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
        // Fallback to localStorage for legacy games
        setMyPlayerName(localStorage.getItem("ch_playerName") || "Hráč");
        setMyRole("admin"); // legacy = full access
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

      <main className="max-w-[1600px] mx-auto px-4 py-4">
        {activeTab === "world" && <WorldTab {...sharedProps} />}
        {activeTab === "civ" && <CivTab {...sharedProps} />}
        {activeTab === "cities" && <CitiesTab {...sharedProps} />}
        {activeTab === "feed" && <FeedTab {...sharedProps} myRole={myRole} />}
        {activeTab === "profile" && (
          <ProfileTab
            sessionId={session.id}
            currentPlayerName={myPlayerName}
            myRole={myRole}
            citiesCount={cities.length}
            eventsCount={events.length}
            wondersCount={wonders.length}
            memoriesCount={memories.length}
            playersCount={players.length}
            onRefetch={refetch}
          />
        )}
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
