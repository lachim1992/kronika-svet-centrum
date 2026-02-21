import CivilizationDNA from "@/components/CivilizationDNA";
import EntityTraitsPanel from "@/components/EntityTraitsPanel";
import DiplomacyPanel from "@/components/DiplomacyPanel";
import WarRoomPanel from "@/components/WarRoomPanel";
import DeclarationsPanel from "@/components/DeclarationsPanel";
import SecretObjectivesPanel from "@/components/SecretObjectivesPanel";
import TurnProgressionPanel from "@/components/TurnProgressionPanel";
import RealmDashboard from "@/components/RealmDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Swords, Feather, Megaphone, Target, Sparkles, Clock, BarChart3 } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  armies: any[];
  resources: any[];
  trades: any[];
  entityTraits: any[];
  civilizations: any[];
  declarations: any[];
  worldCrises: any[];
  secretObjectives: any[];
  cityStates: any[];
  chronicles: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  onRefetch: () => void;
}

const RealmTab = ({
  sessionId, session, events, memories, players, cities, wonders, armies,
  resources, trades, entityTraits, civilizations, declarations, worldCrises,
  secretObjectives, cityStates, chronicles, currentPlayerName, currentTurn,
  myRole, onRefetch,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Shield className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Správa říše</h2>
      </div>

      <Tabs defaultValue="economy" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="economy" className="font-display text-xs gap-1">
            <BarChart3 className="h-3 w-3" />Ekonomika
          </TabsTrigger>
          <TabsTrigger value="turn" className="font-display text-xs gap-1">
            <Clock className="h-3 w-3" />Kolo
          </TabsTrigger>
          <TabsTrigger value="diplomacy" className="font-display text-xs gap-1">
            <Feather className="h-3 w-3" />Diplomacie
          </TabsTrigger>
          <TabsTrigger value="war" className="font-display text-xs gap-1">
            <Swords className="h-3 w-3" />Válka
          </TabsTrigger>
          <TabsTrigger value="civ" className="font-display text-xs gap-1">
            <Sparkles className="h-3 w-3" />Civilizace
          </TabsTrigger>
          <TabsTrigger value="decl" className="font-display text-xs gap-1">
            <Megaphone className="h-3 w-3" />Vyhlášení
          </TabsTrigger>
          <TabsTrigger value="obj" className="font-display text-xs gap-1">
            <Target className="h-3 w-3" />Cíle
          </TabsTrigger>
        </TabsList>

        <TabsContent value="economy" className="mt-3">
          <RealmDashboard
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            currentTurn={currentTurn} myRole={myRole} cities={cities} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="turn" className="mt-3">
          <TurnProgressionPanel
            sessionId={sessionId} currentTurn={currentTurn} players={players}
            currentPlayerName={currentPlayerName} myRole={myRole} gameMode={session?.game_mode} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="diplomacy" className="mt-3">
          <DiplomacyPanel sessionId={sessionId} players={players} cityStates={cityStates} currentPlayerName={currentPlayerName} gameMode={session?.game_mode} />
        </TabsContent>

        <TabsContent value="war" className="mt-3">
          <WarRoomPanel cities={cities} armies={armies} events={events} players={players} currentTurn={currentTurn} worldCrises={worldCrises} />
        </TabsContent>

        <TabsContent value="civ" className="mt-3 space-y-4">
          <CivilizationDNA sessionId={sessionId} playerName={currentPlayerName} civilizations={civilizations} onRefetch={onRefetch} />
          <EntityTraitsPanel
            sessionId={sessionId} traits={entityTraits} cities={cities} events={events}
            players={players.map(p => p.player_name)} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="decl" className="mt-3">
          <DeclarationsPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            declarations={declarations} currentTurn={currentTurn}
            cities={cities} players={players} events={events} memories={memories}
            onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="obj" className="mt-3">
          <SecretObjectivesPanel
            sessionId={sessionId} currentPlayerName={currentPlayerName}
            secretObjectives={secretObjectives} currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RealmTab;
