import { useState } from "react";
import ChronicleFeed from "@/components/ChronicleFeed";
import PlayerChroniclePanel from "@/components/PlayerChroniclePanel";
import WorldFeedPanel from "@/components/WorldFeedPanel";
import EventTimeline from "@/components/EventTimeline";
import EventInput from "@/components/EventInput";
import EventNetworkPanel from "@/components/EventNetworkPanel";
import TimelinePanel from "@/components/TimelinePanel";
import SourceImportPanel from "@/components/SourceImportPanel";
import WorldActionLog from "@/components/WorldActionLog";
import WorldHistoryPanel from "@/components/WorldHistoryPanel";
import RumorsFeedPanel from "@/components/RumorsFeedPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, BookOpen, Swords, BookMarked, CalendarDays, Network, ScrollText, FileText, MessageCircle } from "lucide-react";
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
        <Newspaper className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Feed & Kronika</h2>
      </div>

      <Tabs defaultValue="feed" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="feed" className="font-display text-xs gap-1">
            <Newspaper className="h-3 w-3" />Šuškanda
          </TabsTrigger>
          <TabsTrigger value="worldchronicle" className="font-display text-xs gap-1">
            <BookOpen className="h-3 w-3" />Kronika světa
          </TabsTrigger>
          <TabsTrigger value="mychronicle" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Moje kronika
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
          <TabsTrigger value="rumors" className="font-display text-xs gap-1">
            <MessageCircle className="h-3 w-3" />Zvěsti
          </TabsTrigger>
          <TabsTrigger value="history" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Dějiny
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

        <TabsContent value="feed" className="mt-3">
          <WorldFeedPanel
            sessionId={sessionId} currentTurn={currentTurn} events={events}
            cities={cities} memories={memories} players={players}
            epochStyle={session.epoch_style} myRole={myRole} onRefetch={onRefetch}
            onEventClick={onEventClick} onEntityClick={onEntityClick} entityIndex={entityIndex}
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

        <TabsContent value="rumors" className="mt-3">
          <RumorsFeedPanel
            sessionId={sessionId}
            cities={cities}
            currentTurn={currentTurn}
            entityIndex={entityIndex}
            onEventClick={onEventClick}
            onEntityClick={onEntityClick}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <WorldHistoryPanel
            sessionId={sessionId} events={events} memories={memories}
            epochStyle={session.epoch_style} currentTurn={currentTurn} onEventClick={onEventClick}
          />
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
