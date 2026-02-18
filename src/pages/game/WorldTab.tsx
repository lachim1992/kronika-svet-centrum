import { useState } from "react";
import CityDirectory from "@/components/CityDirectory";
import CityStatesPanel from "@/components/CityStatesPanel";
import UnifiedEntityDetail from "@/components/UnifiedEntityDetail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, Globe, Castle, Mountain, Compass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  const [exploring, setExploring] = useState(false);

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
    setSelectedEntity({ type, id });
  };

  const handleExplore = async () => {
    setExploring(true);
    try {
      const { data, error } = await supabase.functions.invoke("explore-region", {
        body: {
          sessionId,
          playerName: currentPlayerName,
          currentTurn,
          worldFoundation,
          existingRegions: regions,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Objeveny nové země: ${data.region?.name || "Neznámý region"}!`);
      await fetchData();
      onRefetch();

      // Navigate to the new region
      if (data.region?.id) {
        setSelectedEntity({ type: "region", id: data.region.id });
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Průzkum selhal: " + (err.message || "Neznámá chyba"));
    }
    setExploring(false);
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

  const myHomeland = regions.find(r => (r as any).is_homeland && r.owner_player === currentPlayerName);
  const discoveredRegions = regions.filter(r => !(r as any).is_homeland);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 py-1">
        <Globe className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Svět{worldFoundation?.world_name ? ` — ${worldFoundation.world_name}` : ""}</h2>
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

      {/* Exploration action */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleExplore}
          disabled={exploring}
          variant="outline"
          className="font-display gap-2"
        >
          {exploring ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Průzkum probíhá…</>
          ) : (
            <><Compass className="h-4 w-4" />🗺️ Vyslat průzkumnou výpravu</>
          )}
        </Button>
        {expeditions.length > 0 && (
          <span className="text-xs text-muted-foreground">{expeditions.length} výprav celkem</span>
        )}
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
            <Mountain className="h-3 w-3" />Regiony ({regions.length})
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
              <p className="text-center text-muted-foreground text-sm py-8 italic">
                Žádné regiony — vyšlete průzkumnou výpravu!
              </p>
            )}
            {regions.map(r => {
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
