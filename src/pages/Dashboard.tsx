import { useParams, useNavigate } from "react-router-dom";
import { useGameSession, updateEpochStyle } from "@/hooks/useGameSession";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scroll, Copy, Settings, BookOpen, Castle, Swords, Building2, Crown, Users, Landmark, Trophy, MapPin, Feather, ScrollText } from "lucide-react";
import EventInput from "@/components/EventInput";
import EventTimeline from "@/components/EventTimeline";
import ChronicleFeed from "@/components/ChronicleFeed";
import WorldMemoryPanel from "@/components/WorldMemoryPanel";
import CityStatesPanel from "@/components/CityStatesPanel";
import EmpireManagement from "@/components/EmpireManagement";
import EmpireOverview from "@/components/EmpireOverview";
import WondersPanel from "@/components/WondersPanel";
import LeaderboardsPanel from "@/components/LeaderboardsPanel";
import CityDirectory from "@/components/CityDirectory";
import DiplomacyPanel from "@/components/DiplomacyPanel";
import EntityTraitsPanel from "@/components/EntityTraitsPanel";
import { toast } from "sonner";

const Dashboard = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    session, events, memories, chronicles, cityStates, responses,
    players, cities, resources, armies, trades, wonders, entityTraits,
    loading, refetch,
  } = useGameSession(sessionId || null);

  const currentPlayerName = localStorage.getItem("ch_playerName") || "Hráč";

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

  const copyRoomCode = () => {
    navigator.clipboard.writeText(session.room_code);
    toast.success(`Kód místnosti ${session.room_code} zkopírován`);
  };

  return (
    <div className="min-h-screen parchment-bg">
      <header className="imperial-header sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Crown className="h-7 w-7 text-illuminated" />
            <h1 className="font-decorative font-bold text-lg tracking-wide">Chronicle Hub</h1>
            <Badge variant="secondary" className="font-display">Rok {currentTurn}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyRoomCode} className="font-mono text-xs">
              <Copy className="h-3 w-3 mr-1" />{session.room_code}
            </Button>
            <Select value={session.epoch_style} onValueChange={(v) => updateEpochStyle(session.id, v)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <Settings className="h-3 w-3 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="myty">Mýty</SelectItem>
                <SelectItem value="kroniky">Kroniky</SelectItem>
                <SelectItem value="moderni">Moderní zprávy</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />{players.map(p => p.player_name).join(", ")}
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview" className="max-w-[1600px] mx-auto">
        <TabsList className="m-4 bg-card border border-border flex-wrap h-auto gap-1 p-1 illuminated-border">
          <TabsTrigger value="overview" className="font-display text-xs">
            <Crown className="h-4 w-4 mr-1" />Přehled
          </TabsTrigger>
          <TabsTrigger value="chronicle" className="font-display text-xs">
            <BookOpen className="h-4 w-4 mr-1" />Kronika
          </TabsTrigger>
          <TabsTrigger value="traits" className="font-display text-xs">
            <ScrollText className="h-4 w-4 mr-1" />Vlastnosti
          </TabsTrigger>
          <TabsTrigger value="cities" className="font-display text-xs">
            <MapPin className="h-4 w-4 mr-1" />Města
          </TabsTrigger>
          <TabsTrigger value="empire" className="font-display text-xs">
            <Castle className="h-4 w-4 mr-1" />Správa říše
          </TabsTrigger>
          <TabsTrigger value="events" className="font-display text-xs">
            <Swords className="h-4 w-4 mr-1" />Události
          </TabsTrigger>
          <TabsTrigger value="wonders" className="font-display text-xs">
            <Landmark className="h-4 w-4 mr-1" />Divy světa
          </TabsTrigger>
          <TabsTrigger value="diplomacy" className="font-display text-xs">
            <Feather className="h-4 w-4 mr-1" />Diplomacie
          </TabsTrigger>
          <TabsTrigger value="leaderboards" className="font-display text-xs">
            <Trophy className="h-4 w-4 mr-1" />Žebříčky
          </TabsTrigger>
          <TabsTrigger value="citystates" className="font-display text-xs">
            <Building2 className="h-4 w-4 mr-1" />Městské státy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="px-4 pb-6">
          <EmpireOverview
            players={players} cities={cities} resources={resources} armies={armies}
            wonders={wonders} events={events} currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
          />
        </TabsContent>

        <TabsContent value="chronicle" className="px-4 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 manuscript-card p-5">
              <ChronicleFeed
                sessionId={session.id} events={events} memories={memories} chronicles={chronicles}
                epochStyle={session.epoch_style} currentTurn={currentTurn} players={players}
                currentPlayerName={currentPlayerName} entityTraits={entityTraits} cities={cities} onRefetch={refetch}
              />
            </div>
            <div><WorldMemoryPanel sessionId={session.id} memories={memories} cities={cities} currentTurn={currentTurn} /></div>
          </div>
        </TabsContent>

        <TabsContent value="traits" className="pb-6">
          <EntityTraitsPanel
            sessionId={session.id}
            traits={entityTraits}
            cities={cities}
            events={events}
            players={players.map(p => p.player_name)}
            currentTurn={currentTurn}
            onRefetch={refetch}
          />
        </TabsContent>

        <TabsContent value="cities" className="pb-6">
          <CityDirectory
            sessionId={session.id} cities={cities} events={events} players={players}
            memories={memories} wonders={wonders} currentPlayerName={currentPlayerName}
            currentTurn={currentTurn} onRefetch={refetch}
          />
        </TabsContent>

        <TabsContent value="empire" className="px-4 pb-6">
          <EmpireManagement
            sessionId={session.id} players={players} cities={cities} resources={resources}
            armies={armies} trades={trades} currentPlayerName={currentPlayerName} currentTurn={currentTurn}
          />
        </TabsContent>

        <TabsContent value="events" className="px-4 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="manuscript-card p-5">
              <EventInput sessionId={session.id} players={players} cities={cities} currentTurn={currentTurn} turnClosed={false} onEventAdded={refetch} />
            </div>
            <div className="manuscript-card p-5">
              <EventTimeline events={events} responses={responses} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="wonders" className="px-4 pb-6">
          <WondersPanel
            sessionId={session.id} wonders={wonders} cities={cities} players={players}
            memories={memories} currentPlayerName={currentPlayerName} currentTurn={currentTurn} onRefetch={refetch}
          />
        </TabsContent>

        <TabsContent value="diplomacy" className="pb-6">
          <DiplomacyPanel
            sessionId={sessionId!}
            players={players}
            cityStates={cityStates}
            currentPlayerName={currentPlayerName}
          />
        </TabsContent>

        <TabsContent value="leaderboards" className="px-4 pb-6">
          <LeaderboardsPanel
            players={players} cities={cities} resources={resources} armies={armies}
            wonders={wonders} events={events} chronicles={chronicles}
          />
        </TabsContent>

        <TabsContent value="citystates">
          <CityStatesPanel sessionId={session.id} cityStates={cityStates} recentEvents={events} players={players} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
