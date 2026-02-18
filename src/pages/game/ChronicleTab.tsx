import ChronicleFeed from "@/components/ChronicleFeed";
import PlayerChroniclePanel from "@/components/PlayerChroniclePanel";
import WorldHistoryPanel from "@/components/WorldHistoryPanel";
import WorldFeedPanel from "@/components/WorldFeedPanel";
import EventTimeline from "@/components/EventTimeline";
import EventInput from "@/components/EventInput";
import EventNetworkPanel from "@/components/EventNetworkPanel";
import TimelinePanel from "@/components/TimelinePanel";
import SourceImportPanel from "@/components/SourceImportPanel";
import WorldActionLog from "@/components/WorldActionLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Newspaper, Swords, BookMarked, CalendarDays, Network, ScrollText, FileText } from "lucide-react";

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
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
}

const ChronicleTab = ({
  sessionId, session, events, memories, chronicles, responses, players, cities,
  entityTraits, civilizations, currentPlayerName, currentTurn, myRole,
  onRefetch, onEventClick,
}: Props) => {
  const isAdmin = myRole === "admin" || !myRole;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <BookOpen className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Kronika</h2>
      </div>

      <Tabs defaultValue="worldchronicle" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="worldchronicle" className="font-display text-xs gap-1">
            <BookOpen className="h-3 w-3" />Svět
          </TabsTrigger>
          <TabsTrigger value="mychronicle" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Moje
          </TabsTrigger>
          <TabsTrigger value="feed" className="font-display text-xs gap-1">
            <Newspaper className="h-3 w-3" />Feed
          </TabsTrigger>
          <TabsTrigger value="events" className="font-display text-xs gap-1">
            <Swords className="h-3 w-3" />Události
          </TabsTrigger>
          <TabsTrigger value="timeline" className="font-display text-xs gap-1">
            <CalendarDays className="h-3 w-3" />Časová osa
          </TabsTrigger>
          <TabsTrigger value="network" className="font-display text-xs gap-1">
            <Network className="h-3 w-3" />Síť
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="import" className="font-display text-xs gap-1">
              <FileText className="h-3 w-3" />Import
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="actionlog" className="font-display text-xs gap-1">
              <ScrollText className="h-3 w-3" />Log
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="worldchronicle" className="mt-3">
          <ChronicleFeed
            sessionId={sessionId} events={events} memories={memories} chronicles={chronicles}
            epochStyle={session.epoch_style} currentTurn={currentTurn} players={players}
            currentPlayerName={currentPlayerName} entityTraits={entityTraits} cities={cities}
            onRefetch={onRefetch} myRole={myRole} onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="mychronicle" className="mt-3">
          <PlayerChroniclePanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            events={events} memories={memories} cities={cities}
            civilizations={civilizations} epochStyle={session.epoch_style} currentTurn={currentTurn}
            onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="feed" className="mt-3">
          <WorldFeedPanel
            sessionId={sessionId} currentTurn={currentTurn} events={events}
            cities={cities} memories={memories} players={players}
            epochStyle={session.epoch_style} myRole={myRole} onRefetch={onRefetch}
            onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="events" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EventInput sessionId={sessionId} players={players} cities={cities} currentTurn={currentTurn} turnClosed={false} onEventAdded={onRefetch} />
            <EventTimeline events={events} responses={responses} currentPlayerName={currentPlayerName} currentTurn={currentTurn} cities={cities} memories={memories} epochStyle={session.epoch_style} />
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          <TimelinePanel sessionId={sessionId} onEventClick={onEventClick} />
        </TabsContent>

        <TabsContent value="network" className="mt-3">
          <EventNetworkPanel sessionId={sessionId} onEventClick={onEventClick} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="import" className="mt-3">
            <SourceImportPanel sessionId={sessionId} currentPlayerName={currentPlayerName} onRefetch={onRefetch} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="actionlog" className="mt-3">
            <WorldActionLog sessionId={sessionId} currentTurn={currentTurn} myRole={myRole} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default ChronicleTab;
