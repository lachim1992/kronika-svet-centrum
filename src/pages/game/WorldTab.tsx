import { useState } from "react";
import CityDirectory from "@/components/CityDirectory";
import CityStatesPanel from "@/components/CityStatesPanel";
import UnifiedEntityDetail from "@/components/UnifiedEntityDetail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, Globe, Castle, Mountain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  greatPersons: any[];
  cityStates: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  worldFoundation: any;
  entityIndex?: any;
  onRefetch: () => void;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  // External navigation target
  worldEntityTarget?: { type: string; id: string } | null;
  onClearWorldEntityTarget?: () => void;
}

const WorldTab = ({
  sessionId, session, events, memories, players, cities, wonders, greatPersons,
  cityStates, currentPlayerName, currentTurn, myRole, worldFoundation, entityIndex,
  onRefetch, onEventClick, onEntityClick,
  worldEntityTarget, onClearWorldEntityTarget,
}: Props) => {
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string } | null>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [pRes, rRes] = await Promise.all([
        supabase.from("provinces").select("*").eq("session_id", sessionId),
        supabase.from("regions").select("*").eq("session_id", sessionId),
      ]);
      if (pRes.data) setProvinces(pRes.data);
      if (rRes.data) setRegions(rRes.data);
    };
    fetch();
  }, [sessionId]);

  // Handle external navigation
  useEffect(() => {
    if (worldEntityTarget) {
      setSelectedEntity(worldEntityTarget);
      onClearWorldEntityTarget?.();
    }
  }, [worldEntityTarget]);

  const handleEntityClick = (type: string, id: string) => {
    if (type === "event") {
      onEventClick?.(id);
      return;
    }
    setSelectedEntity({ type, id });
  };

  // Show unified detail
  if (selectedEntity) {
    return (
      <div className="pb-20">
        <UnifiedEntityDetail
          sessionId={sessionId}
          entityType={selectedEntity.type}
          entityId={selectedEntity.id}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          epochStyle={session.epoch_style}
          cities={cities}
          events={events}
          memories={memories}
          wonders={wonders}
          players={players}
          greatPersons={greatPersons}
          entityIndex={entityIndex}
          onBack={() => setSelectedEntity(null)}
          onEventClick={onEventClick}
          onEntityClick={handleEntityClick}
          onRefetch={onRefetch}
        />
      </div>
    );
  }

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
          <TabsTrigger value="provinces" className="font-display text-xs gap-1">
            <Castle className="h-3 w-3" />Provincie
          </TabsTrigger>
          <TabsTrigger value="regions" className="font-display text-xs gap-1">
            <Mountain className="h-3 w-3" />Regiony
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
            onCityClick={(cityId) => handleEntityClick("city", cityId)}
          />
        </TabsContent>

        <TabsContent value="provinces" className="mt-3">
          <div className="space-y-2">
            {provinces.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8 italic">Žádné provincie</p>
            )}
            {provinces.map(p => (
              <div key={p.id} className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors"
                onClick={() => handleEntityClick("province", p.id)}>
                <div className="flex items-center gap-2">
                  <Castle className="h-4 w-4 text-primary" />
                  <span className="font-display font-semibold text-sm">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{p.owner_player}</span>
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="regions" className="mt-3">
          <div className="space-y-2">
            {regions.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8 italic">Žádné regiony</p>
            )}
            {regions.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors"
                onClick={() => handleEntityClick("region", r.id)}>
                <div className="flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-primary" />
                  <span className="font-display font-semibold text-sm">{r.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{r.owner_player || "Neutrální"}</span>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-1 truncate">{r.description}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="citystates" className="mt-3">
          <CityStatesPanel sessionId={sessionId} cityStates={cityStates} recentEvents={events} players={players} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorldTab;
