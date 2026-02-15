import { useParams, useNavigate } from "react-router-dom";
import { useGameSession, updateEpochStyle } from "@/hooks/useGameSession";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Scroll, Copy, Settings, Map, Building2 } from "lucide-react";
import EventInput from "@/components/EventInput";
import EventTimeline from "@/components/EventTimeline";
import ChronicleFeed from "@/components/ChronicleFeed";
import WorldMemoryPanel from "@/components/WorldMemoryPanel";
import CityStatesPanel from "@/components/CityStatesPanel";
import { toast } from "sonner";

const Dashboard = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, events, memories, chronicles, cityStates, responses, loading } = useGameSession(sessionId || null);

  const currentPlayerName = localStorage.getItem("ch_playerName") || "Hráč";
  const currentTurn = events.length > 0 ? Math.max(...events.map((e) => e.turn_number)) : 1;

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

  const copyRoomCode = () => {
    navigator.clipboard.writeText(session.room_code);
    toast.success(`Kód místnosti ${session.room_code} zkopírován`);
  };

  return (
    <div className="min-h-screen parchment-bg">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Scroll className="h-6 w-6 text-primary" />
            <h1 className="font-display font-bold text-lg">Chronicle Hub</h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={copyRoomCode} className="font-mono">
              <Copy className="h-3 w-3 mr-1" />
              {session.room_code}
            </Button>

            <Select value={session.epoch_style} onValueChange={(v) => updateEpochStyle(session.id, v)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <Settings className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="myty">Mýty</SelectItem>
                <SelectItem value="kroniky">Kroniky</SelectItem>
                <SelectItem value="moderni">Moderní zprávy</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground hidden md:inline">
              {session.player1_name} vs {session.player2_name}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <Tabs defaultValue="dashboard" className="max-w-[1600px] mx-auto">
        <TabsList className="m-4 bg-card border border-border">
          <TabsTrigger value="dashboard" className="font-display">
            <Map className="h-4 w-4 mr-1" />
            Hlavní deska
          </TabsTrigger>
          <TabsTrigger value="citystates" className="font-display">
            <Building2 className="h-4 w-4 mr-1" />
            Městské státy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="px-4 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Event Input */}
            <div className="bg-card p-5 rounded-lg border border-border shadow-parchment">
              <EventInput
                sessionId={session.id}
                player1Name={session.player1_name}
                player2Name={session.player2_name}
                currentTurn={currentTurn}
              />
            </div>

            {/* Center: Timeline */}
            <div className="bg-card p-5 rounded-lg border border-border shadow-parchment">
              <EventTimeline
                events={events}
                responses={responses}
                currentPlayerName={currentPlayerName}
              />
            </div>

            {/* Right: Chronicle + Memory */}
            <div className="space-y-6">
              <div className="bg-card p-5 rounded-lg border border-border shadow-parchment">
                <ChronicleFeed
                  sessionId={session.id}
                  events={events}
                  memories={memories}
                  chronicles={chronicles}
                  epochStyle={session.epoch_style}
                />
              </div>
              <WorldMemoryPanel sessionId={session.id} memories={memories} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="citystates">
          <CityStatesPanel
            sessionId={session.id}
            cityStates={cityStates}
            recentEvents={events}
            player1Name={session.player1_name}
            player2Name={session.player2_name}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
