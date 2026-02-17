import CityDirectory from "@/components/CityDirectory";
import EmpireManagement from "@/components/EmpireManagement";
import GreatPersonsPanel from "@/components/GreatPersonsPanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MapPin, Castle, Star } from "lucide-react";

interface Props {
  sessionId: string;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  resources: any[];
  armies: any[];
  trades: any[];
  greatPersons: any[];
  currentPlayerName: string;
  currentTurn: number;
  onRefetch: () => void;
}

const CitiesTab = ({
  sessionId, events, memories, players, cities, wonders, resources, armies, trades,
  greatPersons, currentPlayerName, currentTurn, onRefetch,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <Accordion type="multiple" defaultValue={["mycities"]} className="space-y-2">
        <AccordionItem value="mycities" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Moje města</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <CityDirectory
              sessionId={sessionId} cities={cities} events={events} players={players}
              memories={memories} wonders={wonders} currentPlayerName={currentPlayerName}
              currentTurn={currentTurn} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="economy" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Castle className="h-4 w-4 text-primary" />Správa říše</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <EmpireManagement
              sessionId={sessionId} players={players} cities={cities} resources={resources}
              armies={armies} trades={trades} currentPlayerName={currentPlayerName} currentTurn={currentTurn}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="persons" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" />Velké osobnosti</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <GreatPersonsPanel
              sessionId={sessionId} currentPlayerName={currentPlayerName}
              greatPersons={greatPersons} cities={cities} currentTurn={currentTurn} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default CitiesTab;
