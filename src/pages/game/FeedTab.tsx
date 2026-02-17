import EventTimeline from "@/components/EventTimeline";
import EventInput from "@/components/EventInput";
import PlayerChroniclePanel from "@/components/PlayerChroniclePanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Newspaper, Swords, BookMarked } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  responses: any[];
  players: any[];
  cities: any[];
  civilizations: any[];
  currentPlayerName: string;
  currentTurn: number;
  onRefetch: () => void;
}

const FeedTab = ({
  sessionId, session, events, memories, responses, players, cities, civilizations,
  currentPlayerName, currentTurn, onRefetch,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <Accordion type="multiple" defaultValue={["events"]} className="space-y-2">
        <AccordionItem value="events" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Swords className="h-4 w-4 text-primary" />Události</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EventInput sessionId={sessionId} players={players} cities={cities} currentTurn={currentTurn} turnClosed={false} onEventAdded={onRefetch} />
              <EventTimeline events={events} responses={responses} currentPlayerName={currentPlayerName} currentTurn={currentTurn} cities={cities} memories={memories} epochStyle={session.epoch_style} />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="playerchronicle" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><BookMarked className="h-4 w-4 text-primary" />Moje kronika</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <PlayerChroniclePanel
              sessionId={sessionId} currentPlayerName={currentPlayerName}
              events={events} memories={memories} cities={cities}
              civilizations={civilizations} epochStyle={session.epoch_style} currentTurn={currentTurn}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default FeedTab;
