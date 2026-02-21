import { useState, useEffect } from "react";
import CityDirectory from "@/components/CityDirectory";
import CityStatesPanel from "@/components/CityStatesPanel";
import UnifiedEntityDetail from "@/components/UnifiedEntityDetail";
import ExplorationPanel from "@/components/ExplorationPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, Globe, Castle, Mountain, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useDiscoveries } from "@/hooks/useDiscoveries";

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
  worldEntityTarget?: { type: string; id: string } | null;
  onClearWorldEntityTarget?: () => void;
}

const BIOME_LABELS: Record<string, string> = {
  plains: "🌾 Pláně", coast: "🌊 Pobřeží", mountains: "⛰️ Hory",
  forest: "🌲 Lesy", desert: "🏜️ Poušť", tundra: "❄️ Tundra",
  volcanic: "🌋 Vulkanický", swamp: "🏞️ Bažiny",
};

const WorldTab = ({
  sessionId, session, events, memories, players, cities, wonders, greatPersons,
  cityStates, currentPlayerName, currentTurn, myRole, worldFoundation, entityIndex,
  onRefetch, onEventClick, onEntityClick,
  worldEntityTarget, onClearWorldEntityTarget,
}: Props) => {
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string } | null>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);

  const { isDiscovered, isAdmin, refetch: refetchDiscoveries } = useDiscoveries(sessionId, currentPlayerName, myRole);

  const fetchData = async () => {
    const [pRes, rRes, eRes] = await Promise.all([
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("regions").select("*").eq("session_id", sessionId),
      supabase.from("expeditions").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }),
    ]);
    if (pRes.data) setProvinces(pRes.data);
    if (rRes.data) setRegions(rRes.data);
    if (eRes.data) setExpeditions(eRes.data);
  };

  useEffect(() => { fetchData(); }, [sessionId]);

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
    // Non-admin can only open discovered entities
    if (!isAdmin && !isDiscovered(type, id)) return;
    setSelectedEntity({ type, id });
  };

  const handleExploreComplete = async (regionId?: string) => {
    await fetchData();
    await refetchDiscoveries();
    onRefetch();
    if (regionId) {
      setSelectedEntity({ type: "region", id: regionId });
    }
  };

  // Filter data by discoveries for non-admin
  const visibleRegions = isAdmin ? regions : regions.filter(r => isDiscovered("region", r.id));
  const visibleProvinces = isAdmin ? provinces : provinces.filter(p => isDiscovered("province", p.id));
  const visibleCities = isAdmin ? cities : cities.filter(c =>
    c.owner_player === currentPlayerName || isDiscovered("city", c.id)
  );

  // Show unified detail
  if (selectedEntity) {
    // Access check for non-admin
    if (!isAdmin && !isDiscovered(selectedEntity.type, selectedEntity.id) &&
        !(selectedEntity.type === "city" && visibleCities.some(c => c.id === selectedEntity.id))) {
      setSelectedEntity(null);
    } else {
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
            cities={visibleCities}
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
  }

  const myHomeland = visibleRegions.find(r => (r as any).is_homeland && r.owner_player === currentPlayerName);
  const discoveredRegions = visibleRegions.filter(r => !(r as any).is_homeland || r.owner_player !== currentPlayerName);
  const unknownCount = isAdmin ? 0 : regions.length - visibleRegions.length;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Globe className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Svět{worldFoundation?.world_name ? ` — ${worldFoundation.world_name}` : ""}</h2>
        {!isAdmin && (
          <Badge variant="outline" className="ml-auto text-[9px] gap-1">
            <Eye className="h-3 w-3" />{visibleRegions.length} známých
            {unknownCount > 0 && <><EyeOff className="h-3 w-3 ml-1" />{unknownCount} neznámých</>}
          </Badge>
        )}
      </div>

      {/* Homeland banner */}
      {myHomeland && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => handleEntityClick("region", myHomeland.id)}>
          <div className="flex items-center gap-2">
            <Mountain className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold text-sm">Domovský region: {myHomeland.name}</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {BIOME_LABELS[(myHomeland as any).biome] || "🌍 Region"}
            </Badge>
          </div>
          {myHomeland.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{myHomeland.description}</p>
          )}
        </div>
      )}

      {/* Exploration panel */}
      <ExplorationPanel
        sessionId={sessionId}
        playerName={currentPlayerName}
        currentTurn={currentTurn}
        worldFoundation={worldFoundation}
        regions={regions}
        expeditions={expeditions}
        onExploreComplete={handleExploreComplete}
      />

      <Tabs defaultValue="cities" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="cities" className="font-display text-xs gap-1">
            <MapPin className="h-3 w-3" />Města ({visibleCities.length})
          </TabsTrigger>
          <TabsTrigger value="provinces" className="font-display text-xs gap-1">
            <Castle className="h-3 w-3" />Provincie ({visibleProvinces.length})
          </TabsTrigger>
          <TabsTrigger value="regions" className="font-display text-xs gap-1">
            <Mountain className="h-3 w-3" />Regiony ({visibleRegions.length})
          </TabsTrigger>
          <TabsTrigger value="citystates" className="font-display text-xs gap-1">
            <Building2 className="h-3 w-3" />Městské státy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cities" className="mt-3">
          <CityDirectory
            sessionId={sessionId} cities={visibleCities} events={events} players={players}
            memories={memories} wonders={wonders} currentPlayerName={currentPlayerName}
            currentTurn={currentTurn} myRole={myRole} onRefetch={onRefetch}
            onCityClick={(cityId) => handleEntityClick("city", cityId)}
          />
        </TabsContent>

        <TabsContent value="provinces" className="mt-3">
          <div className="space-y-2">
            {visibleProvinces.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8 italic">
                {isAdmin ? "Žádné provincie" : "Žádné objevené provincie — vyšlete průzkumnou výpravu!"}
              </p>
            )}
            {visibleProvinces.map(p => (
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
            {visibleRegions.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8 italic">
                {isAdmin ? "Žádné regiony" : "Žádné známé regiony — vyšlete průzkumnou výpravu!"}
              </p>
            )}
            {visibleRegions.map(r => {
              const reg = r as any;
              return (
                <div key={r.id} className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors"
                  onClick={() => handleEntityClick("region", r.id)}>
                  <div className="flex items-center gap-2">
                    <Mountain className="h-4 w-4 text-primary" />
                    <span className="font-display font-semibold text-sm">{r.name}</span>
                    {reg.is_homeland && <Badge variant="secondary" className="text-[9px]">Domovina</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {r.owner_player || "NPC"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {reg.biome && (
                      <Badge variant="outline" className="text-[9px]">
                        {BIOME_LABELS[reg.biome] || reg.biome}
                      </Badge>
                    )}
                    {reg.discovered_turn && (
                      <span className="text-[10px] text-muted-foreground">
                        Objeveno: Rok {reg.discovered_turn}
                      </span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 truncate">{r.description}</p>}
                </div>
              );
            })}

            {/* Unknown territories hint for non-admin */}
            {!isAdmin && unknownCount > 0 && (
              <div className="p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 text-center">
                <EyeOff className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground italic">
                  Za hranicemi leží ještě {unknownCount} neprozkoumaných oblastí…
                </p>
              </div>
            )}
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
