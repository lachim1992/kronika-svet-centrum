import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListOrdered, Timer, Settings, Monitor, Route, UserX } from "lucide-react";
import ActionQueuePanel from "@/components/ActionQueuePanel";
import TimePoolPanel from "@/components/TimePoolPanel";
import ServerConfigPanel from "@/components/ServerConfigPanel";
import AdminMonitorPanel from "@/components/AdminMonitorPanel";
import TravelPanel from "@/components/TravelPanel";
import InactivityPanel from "@/components/InactivityPanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  cities: any[];
  armies: any[];
  players: any[];
  resources: any[];
  events: any[];
  worldCrises: any[];
}

const PersistentTab = ({
  sessionId, currentPlayerName, myRole, cities, armies,
  players, resources, events, worldCrises,
}: Props) => {
  const isAdmin = myRole === "admin" || myRole === "moderator";

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Timer className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Persistentní svět</h2>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="queue" className="font-display text-xs gap-1">
            <ListOrdered className="h-3 w-3" /> Fronta akcí
          </TabsTrigger>
          <TabsTrigger value="travel" className="font-display text-xs gap-1">
            <Route className="h-3 w-3" /> Cestování
          </TabsTrigger>
          <TabsTrigger value="pools" className="font-display text-xs gap-1">
            <Timer className="h-3 w-3" /> Časové fondy
          </TabsTrigger>
          <TabsTrigger value="inactivity" className="font-display text-xs gap-1">
            <UserX className="h-3 w-3" /> Delegace
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="monitor" className="font-display text-xs gap-1">
                <Monitor className="h-3 w-3" /> Monitor
              </TabsTrigger>
              <TabsTrigger value="config" className="font-display text-xs gap-1">
                <Settings className="h-3 w-3" /> Konfigurace
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="queue" className="mt-3">
          <ActionQueuePanel sessionId={sessionId} currentPlayerName={currentPlayerName} />
        </TabsContent>
        <TabsContent value="travel" className="mt-3">
          <TravelPanel sessionId={sessionId} currentPlayerName={currentPlayerName} />
        </TabsContent>
        <TabsContent value="pools" className="mt-3">
          <TimePoolPanel sessionId={sessionId} currentPlayerName={currentPlayerName} cities={cities} />
        </TabsContent>
        <TabsContent value="inactivity" className="mt-3">
          <InactivityPanel sessionId={sessionId} currentPlayerName={currentPlayerName} myRole={myRole} players={players} />
        </TabsContent>
        {isAdmin && (
          <>
            <TabsContent value="monitor" className="mt-3">
              <AdminMonitorPanel
                sessionId={sessionId} cities={cities} armies={armies}
                players={players} resources={resources} events={events} worldCrises={worldCrises}
              />
            </TabsContent>
            <TabsContent value="config" className="mt-3">
              <ServerConfigPanel sessionId={sessionId} myRole={myRole} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default PersistentTab;
