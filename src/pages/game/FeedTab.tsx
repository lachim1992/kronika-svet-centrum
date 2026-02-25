import EventTimeline from "@/components/EventTimeline";
import EventInput from "@/components/EventInput";
import EventNetworkPanel from "@/components/EventNetworkPanel";
import TimelinePanel from "@/components/TimelinePanel";
import SourceImportPanel from "@/components/SourceImportPanel";
import WorldActionLog from "@/components/WorldActionLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Swords, CalendarDays, Network, ScrollText, FileText } from "lucide-react";
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

const FeedTab = ({
  sessionId, session, events, memories, chronicles, responses, players, cities,
  entityTraits, civilizations, currentPlayerName, currentTurn, myRole,
  entityIndex, onRefetch, onEventClick, onEntityClick,
}: Props) => {
  const isAdmin = myRole === "admin" || !myRole;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Swords className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Šepoty — Systém</h2>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
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

        <TabsContent value="events" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EventInput sessionId={sessionId} players={players} cities={cities} currentTurn={currentTurn} turnClosed={false} onEventAdded={onRefetch} />
            <EventTimeline events={events} responses={responses} currentPlayerName={currentPlayerName} currentTurn={currentTurn} cities={cities} memories={memories} epochStyle={session.epoch_style}
              entityIndex={entityIndex} onEntityClick={onEntityClick} />
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
            <WorldActionLog sessionId={sessionId} currentTurn={currentTurn} myRole={myRole}
              entityIndex={entityIndex} onEntityClick={onEntityClick} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default FeedTab;
