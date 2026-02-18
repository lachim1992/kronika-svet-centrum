import WorldCodex from "@/components/WorldCodex";
import WikiPanel from "@/components/WikiPanel";
import WondersPanel from "@/components/WondersPanel";
import GreatPersonsPanel from "@/components/GreatPersonsPanel";
import LeaderboardsPanel from "@/components/LeaderboardsPanel";
import WorldHistoryPanel from "@/components/WorldHistoryPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, BookOpen, Landmark, Star, Trophy, BookMarked } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  greatPersons: any[];
  resources: any[];
  armies: any[];
  chronicles: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  worldFoundation: any;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
  codexEntityTarget?: { type: string; id: string } | null;
  onClearEntityTarget?: () => void;
}

const CodexTab = ({
  sessionId, session, events, memories, players, cities, wonders, greatPersons,
  resources, armies, chronicles, currentPlayerName, currentTurn, myRole,
  worldFoundation, onRefetch, onEventClick, codexEntityTarget, onClearEntityTarget,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Library className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Kodex</h2>
      </div>

      <Tabs defaultValue="wiki" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="wiki" className="font-display text-xs gap-1">
            <BookOpen className="h-3 w-3" />Encyklopedie
          </TabsTrigger>
          <TabsTrigger value="codex" className="font-display text-xs gap-1">
            <Library className="h-3 w-3" />World Codex
          </TabsTrigger>
          <TabsTrigger value="wonders" className="font-display text-xs gap-1">
            <Landmark className="h-3 w-3" />Divy světa
          </TabsTrigger>
          <TabsTrigger value="persons" className="font-display text-xs gap-1">
            <Star className="h-3 w-3" />Osobnosti
          </TabsTrigger>
          <TabsTrigger value="history" className="font-display text-xs gap-1">
            <BookMarked className="h-3 w-3" />Dějiny
          </TabsTrigger>
          <TabsTrigger value="leaderboards" className="font-display text-xs gap-1">
            <Trophy className="h-3 w-3" />Žebříčky
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wiki" className="mt-3">
          <WikiPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            cities={cities} wonders={wonders} greatPersons={greatPersons}
            events={events} myRole={myRole} epochStyle={session.epoch_style}
            onRefetch={onRefetch} onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="codex" className="mt-3">
          <WorldCodex foundation={worldFoundation} />
        </TabsContent>

        <TabsContent value="wonders" className="mt-3">
          <WondersPanel
            sessionId={sessionId} wonders={wonders} cities={cities} players={players}
            memories={memories} currentPlayerName={currentPlayerName} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="persons" className="mt-3">
          <GreatPersonsPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            greatPersons={greatPersons} cities={cities} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <WorldHistoryPanel
            sessionId={sessionId} events={events} memories={memories}
            epochStyle={session.epoch_style} currentTurn={currentTurn} onEventClick={onEventClick}
          />
        </TabsContent>

        <TabsContent value="leaderboards" className="mt-3">
          <LeaderboardsPanel players={players} cities={cities} resources={resources} armies={armies} wonders={wonders} events={events} chronicles={chronicles} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodexTab;
