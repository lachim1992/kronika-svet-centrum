import ChronicleFeed from "@/components/ChronicleFeed";
import WorldMemoryPanel from "@/components/WorldMemoryPanel";
import WorldHistoryPanel from "@/components/WorldHistoryPanel";
import WondersPanel from "@/components/WondersPanel";
import CityStatesPanel from "@/components/CityStatesPanel";
import WikiPanel from "@/components/WikiPanel";
import WorldCodex from "@/components/WorldCodex";
import TurnProgressionPanel from "@/components/TurnProgressionPanel";
import WorldActionLog from "@/components/WorldActionLog";
import EventNetworkPanel from "@/components/EventNetworkPanel";
import SourceImportPanel from "@/components/SourceImportPanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Globe, Landmark, Building2, BookMarked, Clock, ScrollText, Network, FileText } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  chronicles: any[];
  cityStates: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  entityTraits: any[];
  greatPersons: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  worldFoundation: any;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
}

const WorldTab = ({
  sessionId, session, events, memories, chronicles, cityStates, players, cities,
  wonders, entityTraits, greatPersons, currentPlayerName, currentTurn, myRole,
  worldFoundation, onRefetch, onEventClick,
}: Props) => {
  const isAdmin = myRole === "admin" || !myRole;

  return (
    <div className="space-y-4 pb-20">
      <Accordion type="multiple" defaultValue={["turn", "chronicle", "codex"]} className="space-y-2">
        {/* Turn Progression */}
        <AccordionItem value="turn" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />⏱️ Průběh kola</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <TurnProgressionPanel
              sessionId={sessionId} currentTurn={currentTurn} players={players}
              currentPlayerName={currentPlayerName} myRole={myRole} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="chronicle" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />🌍 Kronika světa</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <ChronicleFeed
              sessionId={sessionId} events={events} memories={memories} chronicles={chronicles}
              epochStyle={session.epoch_style} currentTurn={currentTurn} players={players}
              currentPlayerName={currentPlayerName} entityTraits={entityTraits} cities={cities}
              onRefetch={onRefetch} myRole={myRole} onEventClick={onEventClick}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Event Network */}
        <AccordionItem value="eventnetwork" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Network className="h-4 w-4 text-primary" />🔗 Síť událostí</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <EventNetworkPanel sessionId={sessionId} onEventClick={onEventClick} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="codex" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" />📖 World Codex</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <WorldCodex foundation={worldFoundation} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="wonders" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />Divy světa</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <WondersPanel
              sessionId={sessionId} wonders={wonders} cities={cities} players={players}
              memories={memories} currentPlayerName={currentPlayerName} currentTurn={currentTurn} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="worldhistory" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><BookMarked className="h-4 w-4 text-primary" />Dějiny světa</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <WorldHistoryPanel
              sessionId={sessionId} events={events} memories={memories}
              epochStyle={session.epoch_style} currentTurn={currentTurn} onEventClick={onEventClick}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="citystates" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Městské státy</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <CityStatesPanel sessionId={sessionId} cityStates={cityStates} recentEvents={events} players={players} />
          </AccordionContent>
        </AccordionItem>

        {/* Source Import */}
        <AccordionItem value="import" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />📥 Import zdrojů</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <SourceImportPanel
              sessionId={sessionId}
              currentPlayerName={currentPlayerName}
              onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Action Log - Admin Only */}
        {isAdmin && (
          <AccordionItem value="actionlog" className="manuscript-card">
            <AccordionTrigger className="px-4 py-3 font-display text-sm">
              <span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" />📜 Action Log</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <WorldActionLog sessionId={sessionId} currentTurn={currentTurn} myRole={myRole} />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="wiki" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />📖 Wiki</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <WikiPanel
              sessionId={sessionId} currentPlayerName={currentPlayerName}
              cities={cities} wonders={wonders} greatPersons={greatPersons}
              events={events} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default WorldTab;
