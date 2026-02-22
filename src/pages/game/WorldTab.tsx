import { useState, useEffect } from "react";
import CityDirectory from "@/components/CityDirectory";
import CityStatesPanel from "@/components/CityStatesPanel";
import ExplorationPanel from "@/components/ExplorationPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, Globe, Castle, Mountain, Eye, EyeOff, Compass, Map } from "lucide-react";
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
  // selectedEntity state removed — entity details now handled by ChroWiki tab
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

  useEffect(() => {
    if (worldEntityTarget) {
      // Redirect to ChroWiki via onEntityClick
      onEntityClick?.(worldEntityTarget.type, worldEntityTarget.id);
      onClearWorldEntityTarget?.();
    }
  }, [worldEntityTarget]);

  const handleEntityClick = (type: string, id: string) => {
    if (type === "event") {
      onEventClick?.(id);
      return;
    }
    if (!isAdmin && !isDiscovered(type, id)) return;
    // Navigate to ChroWiki for unified entity detail
    onEntityClick?.(type, id);
  };

  const handleExploreComplete = async (regionId?: string) => {
    await fetchData();
    await refetchDiscoveries();
    onRefetch();
    if (regionId) {
      onEntityClick?.("region", regionId);
    }
  };

  // Filter data by discoveries for non-admin
  const visibleRegions = isAdmin ? regions : regions.filter(r => isDiscovered("region", r.id));
  const visibleProvinces = isAdmin ? provinces : provinces.filter(p => isDiscovered("province", p.id));
  const visibleCities = isAdmin ? cities : cities.filter(c =>
    c.owner_player === currentPlayerName || isDiscovered("city", c.id)
  );


  const totalKnown = visibleRegions.length + visibleProvinces.length + visibleCities.length;
  const unknownRegions = isAdmin ? 0 : regions.length - visibleRegions.length;

  return (
    <div className="space-y-6 pb-20">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-2 py-1">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-bold">
          Svět{worldFoundation?.world_name ? ` — ${worldFoundation.world_name}` : ""}
        </h2>
        {!isAdmin && (
          <Badge variant="outline" className="ml-auto text-[10px] gap-1.5 font-display">
            <Eye className="h-3 w-3" />
            {totalKnown} známých entit
          </Badge>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* SECTION A — Známý svět                     */}
      {/* ═══════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Map className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Známý svět</h3>
        </div>

        {totalKnown === 0 && !isAdmin ? (
          <div className="game-card p-8 text-center">
            <EyeOff className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground mb-1">Zatím jste neobjevili žádné další oblasti.</p>
            <p className="text-xs text-muted-foreground italic">
              Vyšlete výpravu a rozšiřte své poznání světa.
            </p>
          </div>
        ) : (
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
              {isAdmin && (
                <TabsTrigger value="citystates" className="font-display text-xs gap-1">
                  <Building2 className="h-3 w-3" />Městské státy
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="cities" className="mt-3">
              {visibleCities.length === 0 ? (
                <EmptyHint text={isAdmin ? "Žádná města" : "Žádná objevená města — vyšlete výpravu!"} />
              ) : (
                <CityDirectory
                  sessionId={sessionId} cities={visibleCities} events={events} players={players}
                  memories={memories} wonders={wonders} currentPlayerName={currentPlayerName}
                  currentTurn={currentTurn} myRole={myRole} onRefetch={onRefetch}
                  onCityClick={(cityId) => handleEntityClick("city", cityId)}
                />
              )}
            </TabsContent>

            <TabsContent value="provinces" className="mt-3">
              <div className="space-y-2">
                {visibleProvinces.length === 0 ? (
                  <EmptyHint text={isAdmin ? "Žádné provincie" : "Žádné objevené provincie — vyšlete výpravu!"} />
                ) : (
                  visibleProvinces.map(p => (
                    <div key={p.id} className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors"
                      onClick={() => handleEntityClick("province", p.id)}>
                      <div className="flex items-center gap-2">
                        <Castle className="h-4 w-4 text-primary" />
                        <span className="font-display font-semibold text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{p.owner_player}</span>
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="regions" className="mt-3">
              <div className="space-y-2">
                {visibleRegions.length === 0 ? (
                  <EmptyHint text={isAdmin ? "Žádné regiony" : "Žádné známé regiony — vyšlete výpravu!"} />
                ) : (
                  visibleRegions.map(r => {
                    const reg = r as any;
                    const isHomeland = reg.is_homeland && r.owner_player === currentPlayerName;
                    return (
                      <div key={r.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isHomeland ? "border-primary/30 bg-primary/5 hover:bg-primary/10" : "border-border bg-card hover:border-primary/40"
                        }`}
                        onClick={() => handleEntityClick("region", r.id)}>
                        <div className="flex items-center gap-2">
                          <Mountain className="h-4 w-4 text-primary" />
                          <span className="font-display font-semibold text-sm">{r.name}</span>
                          {isHomeland && <Badge variant="secondary" className="text-[9px]">Domovina</Badge>}
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
                  })
                )}
              </div>
            </TabsContent>

            {isAdmin && (
              <TabsContent value="citystates" className="mt-3">
                <CityStatesPanel sessionId={sessionId} cityStates={cityStates} recentEvents={events} players={players} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </section>

      {/* ─── Soft divider ─── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-dashed border-muted-foreground/20" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-[10px] text-muted-foreground font-display uppercase tracking-wider">
            {isAdmin ? "Průzkum" : "Neznámé území"}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* SECTION B — Neznámé území / Exploration     */}
      {/* ═══════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Compass className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">
            {isAdmin ? "Průzkumné výpravy" : "Neznámé území"}
          </h3>
          {!isAdmin && unknownRegions > 0 && (
            <Badge variant="outline" className="text-[9px] gap-1 ml-auto">
              <EyeOff className="h-3 w-3" />
              {unknownRegions} neprozkoumaných oblastí
            </Badge>
          )}
        </div>

        {!isAdmin && unknownRegions > 0 && (
          <div className="p-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 mb-3">
            <p className="text-xs text-muted-foreground italic text-center">
              Za hranicemi leží ještě {unknownRegions} neprozkoumaných oblastí…
            </p>
          </div>
        )}

        <ExplorationPanel
          sessionId={sessionId}
          playerName={currentPlayerName}
          currentTurn={currentTurn}
          worldFoundation={worldFoundation}
          regions={regions}
          expeditions={expeditions}
          onExploreComplete={handleExploreComplete}
        />
      </section>

    </div>
  );
};

/* ─── Empty state helper ─── */
function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-center text-muted-foreground text-sm py-8 italic">{text}</p>
  );
}

export default WorldTab;
