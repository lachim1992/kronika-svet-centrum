import { useState } from "react";
import CityDirectory from "@/components/CityDirectory";
import CityStatesPanel from "@/components/CityStatesPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, Globe } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  cityStates: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  worldFoundation: any;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
}

const WorldTab = ({
  sessionId, session, events, memories, players, cities, wonders,
  cityStates, currentPlayerName, currentTurn, myRole, worldFoundation,
  onRefetch, onEventClick,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Globe className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Svět{worldFoundation?.world_name ? ` — ${worldFoundation.world_name}` : ""}</h2>
      </div>

      <Tabs defaultValue="cities" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="cities" className="font-display text-xs gap-1">
            <MapPin className="h-3 w-3" />Města
          </TabsTrigger>
          <TabsTrigger value="citystates" className="font-display text-xs gap-1">
            <Building2 className="h-3 w-3" />Městské státy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cities" className="mt-3">
          <CityDirectory
            sessionId={sessionId} cities={cities} events={events} players={players}
            memories={memories} wonders={wonders} currentPlayerName={currentPlayerName}
            currentTurn={currentTurn} onRefetch={onRefetch}
          />
        </TabsContent>

        <TabsContent value="citystates" className="mt-3">
          <CityStatesPanel sessionId={sessionId} cityStates={cityStates} recentEvents={events} players={players} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorldTab;
