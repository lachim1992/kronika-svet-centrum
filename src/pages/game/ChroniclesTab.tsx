import ChronicleFeed from "@/components/ChronicleFeed";
import PlayerChroniclePanel from "@/components/PlayerChroniclePanel";
import WorldHistoryPanel from "@/components/WorldHistoryPanel";
import SeptandaFeed from "@/components/SeptandaFeed";
import EventsLogPanel from "@/components/EventsLogPanel";
import NarrativeConfigEditor from "@/components/NarrativeConfigEditor";
import VictoryProgressPanel from "@/components/VictoryProgressPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, BookMarked, List, MessageCircle, Settings2, Trophy } from "lucide-react";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  chronicles: any[];
  responses: any[];
  players: any[];
  cities: any[];
  entityTraits: any[];
  civilizations: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  entityIndex?: EntityIndex;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

const ChroniclesTab = ({
  sessionId, session, events, memories, chronicles, responses, players, cities,
  entityTraits, civilizations, currentPlayerName, currentTurn, myRole,
  entityIndex, onRefetch, onEventClick, onEntityClick,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <BookOpen className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Kroniky</h2>
      </div>

      {/* Victory Progress — Game Goal */}
      <VictoryProgressPanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
      />

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="events" className="font-display text-xs gap-1">
            <List className="h-3 w-3" />Události
          </TabsTrigger>
          <TabsTrigger value="worldchronicle" className="font-display text-xs gap-1">
            <BookOpen className="h-3 w-3" />Kronika světa
          </TabsTrigger>
          <TabsTrigger value="mychronicle" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Moje kronika
          </TabsTrigger>
          <TabsTrigger value="history" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Dějiny
          </TabsTrigger>
          <TabsTrigger value="septanda" className="font-display text-xs gap-1">
            <MessageCircle className="h-3 w-3" />Šeptanda
          </TabsTrigger>
          <TabsTrigger value="narrative-config" className="font-display text-xs gap-1">
            <Settings2 className="h-3 w-3" />Nastavení
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-3">
          <EventsLogPanel
            sessionId={sessionId}
            events={events}
            currentTurn={currentTurn}
            entityIndex={entityIndex}
            onEventClick={onEventClick}
            onEntityClick={onEntityClick}
          />
        </TabsContent>

        <TabsContent value="worldchronicle" className="mt-3">
          <ChronicleFeed
            sessionId={sessionId} events={events} memories={memories} chronicles={chronicles}
            epochStyle={session.epoch_style} currentTurn={currentTurn} players={players}
            currentPlayerName={currentPlayerName} entityTraits={entityTraits} cities={cities}
            onRefetch={onRefetch} myRole={myRole} onEventClick={onEventClick}
            onEntityClick={onEntityClick} entityIndex={entityIndex}
          />
        </TabsContent>

        <TabsContent value="mychronicle" className="mt-3">
          <PlayerChroniclePanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            events={events} memories={memories} cities={cities}
            civilizations={civilizations} epochStyle={session.epoch_style} currentTurn={currentTurn}
            onEventClick={onEventClick} onEntityClick={onEntityClick} entityIndex={entityIndex}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <WorldHistoryPanel
            sessionId={sessionId} events={events} memories={memories}
            epochStyle={session.epoch_style} currentTurn={currentTurn} onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="septanda" className="mt-3">
          <SeptandaFeed
            sessionId={sessionId}
            currentTurn={currentTurn}
            currentPlayerName={currentPlayerName}
            players={players.map((p: any) => p.player_name)}
            entityIndex={entityIndex}
            onEventClick={onEventClick}
            onEntityClick={onEntityClick}
          />
        </TabsContent>

        <TabsContent value="narrative-config" className="mt-3">
          <NarrativeConfigEditor
            sessionId={sessionId}
            myRole={myRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChroniclesTab;
