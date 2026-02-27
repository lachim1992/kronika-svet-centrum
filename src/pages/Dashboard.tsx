import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "@/hooks/useGameSession";
import { useAuth } from "@/hooks/useAuth";
import { useEntityIndex } from "@/hooks/useEntityIndex";
import { supabase } from "@/integrations/supabase/client";
import { Scroll } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNextTurn } from "@/hooks/useNextTurn";
import AppHeader from "@/components/layout/AppHeader";
import ResourceHUD from "@/components/layout/ResourceHUD";
import AppShell from "@/components/layout/AppShell";
import type { TabId } from "@/components/layout/BottomNav";
import ActionChooser from "@/components/layout/ActionChooser";
import WorldEventDetailPanel from "@/components/WorldEventDetailPanel";
import GameHubFAB from "@/components/layout/GameHubFAB";
import FoundSettlementDialog from "@/components/FoundSettlementDialog";
import UprisingDialog from "@/components/UprisingDialog";
import Chronicle0Overlay from "@/components/Chronicle0Overlay";
import MultiplayerLobby from "@/components/MultiplayerLobby";
import HomeTab from "@/pages/game/HomeTab";
import WorldTab from "@/pages/game/WorldTab";
import RealmTab from "@/pages/game/RealmTab";
import FeedTab from "@/pages/game/FeedTab";
import ChroniclesTab from "@/pages/game/ChroniclesTab";
import CodexTab from "@/pages/game/CodexTab";
import ProfileTab from "@/pages/game/ProfileTab";
import DevTab from "@/pages/game/DevTab";
import ChroWikiTab from "@/pages/game/ChroWikiTab";
import CouncilTab from "@/pages/game/CouncilTab";
import ArmyTab from "@/pages/game/ArmyTab";
import EconomyTab from "@/pages/game/EconomyTab";
import PersistentTab from "@/pages/game/PersistentTab";
import WorldMapTab from "@/pages/game/WorldMapTab";
import EngineTab from "@/pages/game/EngineTab";

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
  const [wikiEntityTarget, setWikiEntityTarget] = useState<{ type: string; id: string } | null>(null);
  const [showFoundDialog, setShowFoundDialog] = useState(false);
  const [chronicle0, setChronicle0] = useState<{ text: string; title: string; sidebar: any } | null>(null);
  const [showChronicle0, setShowChronicle0] = useState(false);

  const currentTurn = session?.current_turn ?? 0;

  const { processing: turnProcessing, processNextTurn } = useNextTurn({
    sessionId: session?.id || sessionId || "",
    currentTurn,
    playerName: myPlayerName,
    gameMode: session?.game_mode,
    onComplete: refetch,
  });

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

    const fetchChronicle0 = async () => {
      const dismissKey = `chronicle0_dismissed_${sessionId}`;
      if (localStorage.getItem(dismissKey)) return;

      const { data } = await supabase
        .from("chronicle_entries")
        .select("text, references")
        .eq("session_id", sessionId)
        .eq("source_type", "chronicle_zero")
        .maybeSingle();

      if (data && data.text) {
        const refs = data.references as any || {};
        setChronicle0({
          text: data.text,
          title: refs.title || "Kronika Počátku",
          sidebar: refs.sidebar || {},
        });
        setShowChronicle0(true);
      }
    };

    fetchMembership();
    fetchFoundation();
    fetchChronicle0();
  }, [user, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center animate-fade-in">
          <Scroll className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="font-display text-lg text-muted-foreground">Načítání herního světa...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="font-display text-lg">Hra nenalezena</p>
          <Button onClick={() => navigate("/games")}>Zpět na úvod</Button>
        </div>
      </div>
    );
  }

  // Show multiplayer lobby if game is in lobby/generating state
  const initStatus = (session as any).init_status;
  if (session.game_mode === "tb_multi" && (initStatus === "lobby" || initStatus === "generating")) {
    return (
      <MultiplayerLobby
        sessionId={session.id}
        roomCode={session.room_code}
        worldName={worldFoundation?.world_name || "Nový svět"}
        maxPlayers={session.max_players}
        isHost={myRole === "admin"}
        myPlayerName={myPlayerName}
        onGameStart={() => refetch()}
      />
    );
  }

  const handleAction = (action: string, payload?: any) => {
    console.log(`Dashboard handleAction: ${action}`);

    if (action === "found_city") {
      setShowFoundDialog(true);
      return;
    }

    const tabMap: Record<string, TabId> = {
      open_chronicles: "chronicles",
      open_realm: "realm",
      manage_armies: "realm",
      view_threats: "realm",
      send_expedition: "world",
      launch_expedition: "world",
      create_event: "feed",
      write_chronicle: "chronicles",
      add_rumor: "chronicles",
      add_city_rumor: "chronicles",
      add_aftermath_rumor: "chronicles",
      view_drafts: "chronicles",
      view_rumors: "chronicles",
      view_declarations: "feed",
      ai_generate: "chronicles",
      generate_city_story: "chronicles",
      add_related_entity: "codex",
      no_actions: "feed",
      dev_gen_descriptions: "dev",
      dev_gen_images: "dev",
      dev_gen_rumors: "dev",
      dev_hydrate: "dev",
    };

    const targetTab = tabMap[action] || "chronicles";
    setActiveTab(targetTab);

    const implemented = ["open_realm", "manage_armies", "create_event", "write_chronicle", "add_rumor", "view_drafts", "view_rumors", "view_declarations", "view_threats"];
    if (!implemented.includes(action)) {
      toast.info(`Akce "${action}" — přesměrováno na ${targetTab}`, { description: "Plná implementace bude brzy dostupná." });
    }
  };

  const handleEntityClick = (type: string, id: string) => {
    if (type === "event") {
      setEventDetailId(id);
      return;
    }
    // All entity types go to ChroWiki as the single unified detail view
    setWikiEntityTarget({ type, id });
    setActiveTab("wiki");
  };

  /** Navigate to ChroWiki for a specific city (used by hex map city markers) */
  const handleCityClickToWiki = (cityId: string) => {
    setWikiEntityTarget({ type: "city", id: cityId });
    setActiveTab("wiki");
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
    <AppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      showDevTab={true}
      showPersistentTab={session?.game_mode === "time_persistent"}
      worldName={worldFoundation?.world_name}
      header={
        <AppHeader
          roomCode={session.room_code}
          currentTurn={currentTurn}
          worldName={worldFoundation?.world_name}
          playerName={myPlayerName}
          myRole={myRole}
          currentSessionId={session.id}
          onNextTurn={processNextTurn}
          turnProcessing={turnProcessing}
        />
      }
      resourceHud={
        <ResourceHUD sessionId={session.id} playerName={myPlayerName} cities={cities} currentTurn={currentTurn} />
      }
      bottomExtras={
        <>
          <GameHubFAB
            currentSessionId={session.id}
            worldName={worldFoundation?.world_name}
            currentTurn={currentTurn}
            playerName={myPlayerName}
            onAction={handleAction}
            activeTab={activeTab}
            myRole={myRole}
            events={events}
            cities={cities}
            wonders={wonders}
            armies={armies}
            resources={resources}
            declarations={declarations}
            chronicles={chronicles}
            players={players}
          />
          <ActionChooser open={showActionChooser} onClose={() => setShowActionChooser(false)} onAction={handleAction} />
          <FoundSettlementDialog
            open={showFoundDialog}
            onClose={() => setShowFoundDialog(false)}
            sessionId={session.id}
            currentPlayerName={myPlayerName}
            currentTurn={currentTurn}
            myRole={myRole}
            onCreated={(cityId) => {
              refetch();
              setWikiEntityTarget({ type: "city", id: cityId });
              setActiveTab("wiki");
            }}
          />
          <WorldEventDetailPanel
            eventId={eventDetailId}
            open={!!eventDetailId}
            onClose={() => setEventDetailId(null)}
            onEventClick={(id) => setEventDetailId(id)}
          />
          <UprisingDialog
            sessionId={session.id}
            playerName={myPlayerName}
            currentTurn={currentTurn}
            onResolved={() => refetch()}
          />
          {chronicle0 && (
            <Chronicle0Overlay
              open={showChronicle0}
              onClose={() => {
                setShowChronicle0(false);
                localStorage.setItem(`chronicle0_dismissed_${session.id}`, "1");
              }}
              title={chronicle0.title}
              text={chronicle0.text}
              sidebar={chronicle0.sidebar}
              worldName={worldFoundation?.world_name}
              onEntityClick={handleEntityClick}
            />
          )}
        </>
      }
    >
      {activeTab === "home" && <HomeTab {...sharedProps} onFoundCity={() => setShowFoundDialog(true)} />}
      {activeTab === "world" && <WorldTab {...sharedProps} worldEntityTarget={worldEntityTarget} onClearWorldEntityTarget={() => setWorldEntityTarget(null)} />}
      {activeTab === "worldmap" && (
        <WorldMapTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          myRole={myRole}
          worldName={worldFoundation?.world_name}
          onCityClick={handleCityClickToWiki}
        />
      )}
      {activeTab === "realm" && <RealmTab {...sharedProps} />}
      {activeTab === "army" && (
        <ArmyTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          cities={cities}
          onRefetch={refetch}
        />
      )}
      {activeTab === "economy" && (
        <EconomyTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          currentTurn={currentTurn}
          cities={cities}
          resources={resources}
          armies={armies}
          myRole={myRole}
          onEntityClick={handleEntityClick}
          onRefetch={refetch}
          onTabChange={(tab) => setActiveTab(tab as TabId)}
        />
      )}
      {activeTab === "chronicles" && <ChroniclesTab {...sharedProps} />}
      {activeTab === "feed" && <FeedTab {...sharedProps} />}
      {activeTab === "engine" && (
        <EngineTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
        />
      )}
      {activeTab === "codex" && <CodexTab {...sharedProps} codexEntityTarget={codexEntityTarget} onClearEntityTarget={() => setCodexEntityTarget(null)} />}
      {activeTab === "wiki" && <ChroWikiTab sessionId={session.id} currentPlayerName={myPlayerName} myRole={myRole} currentTurn={currentTurn} epochStyle={session.epoch_style} memories={memories} players={players} entityIndex={entityIndex} onEntityClick={handleEntityClick} wikiEntityTarget={wikiEntityTarget} onClearWikiEntityTarget={() => setWikiEntityTarget(null)} />}
      {activeTab === "council" && (
        <CouncilTab
          sessionId={session.id}
          session={session}
          currentPlayerName={myPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          events={events}
          cities={cities}
          resources={resources}
          armies={armies}
          trades={trades}
          declarations={declarations}
          worldCrises={worldCrises}
          cityStates={cityStates}
          players={players}
          onRefetch={refetch}
        />
      )}
      {activeTab === "dev" && (
        <DevTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          onRefetch={refetch}
          citiesCount={cities.length}
          eventsCount={events.length}
          wondersCount={wonders.length}
          memoriesCount={memories.length}
          playersCount={players.length}
        />
      )}
      {activeTab === "persistent" && (
        <PersistentTab
          sessionId={session.id}
          currentPlayerName={myPlayerName}
          myRole={myRole}
          cities={cities}
          armies={armies as any}
          players={players}
          resources={resources}
          events={events}
          worldCrises={worldCrises}
        />
      )}
    </AppShell>
  );
};

export default Dashboard;
