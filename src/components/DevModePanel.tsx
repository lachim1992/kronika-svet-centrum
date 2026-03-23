import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bug, Droplets, Play, Shield, Sprout, FlaskConical, BarChart3, Compass, Info, Map, Zap, Telescope, MapPinPlus, Settings2 } from "lucide-react";
import HydrationSection from "@/components/dev/HydrationSection";
import SimulationSection from "@/components/dev/SimulationSection";
import RealSimulationSection from "@/components/dev/RealSimulationSection";
import WorldIntegritySection from "@/components/dev/WorldIntegritySection";
import SeedSection from "@/components/dev/SeedSection";
import QATestSection from "@/components/dev/QATestSection";
import EconomyQASection from "@/components/dev/EconomyQASection";
import LocalSimulationSection from "@/components/dev/LocalSimulationSection";
import EventEngineSection from "@/components/dev/EventEngineSection";
import SeedMapManager from "@/components/dev/SeedMapManager";
import ObservatoryPanel from "@/components/dev/observatory/ObservatoryPanel";
import DevNodeSpawner from "@/components/dev/DevNodeSpawner";
import DevNodeEditor from "@/components/dev/DevNodeEditor";
import DevPlayerEditor from "@/components/dev/DevPlayerEditor";
import { getPermissions } from "@/lib/permissions";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  myRole?: string;
  onRefetch?: () => void;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

const DevModePanel = ({
  sessionId, currentPlayerName, myRole = "player", onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {
  const perms = getPermissions(myRole);

  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Bug className="h-5 w-5 text-primary" />
          Dev Mode
        </h1>
        <Badge variant="outline" className="font-mono text-xs">
          session: {sessionId.slice(0, 8)}…
        </Badge>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Města", count: citiesCount },
          { label: "Události", count: eventsCount },
          { label: "Divy", count: wondersCount },
          { label: "Paměti", count: memoriesCount },
          { label: "Hráči", count: playersCount },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-2 text-center">
            <p className="text-xl font-bold font-display">{s.count}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue={perms.canRunServerDevTools ? "hydration" : "local-sim"} className="w-full">
        <TabsList className="flex flex-wrap w-full h-auto gap-0.5">
          {perms.canRunServerDevTools && (
            <>
              <TabsTrigger value="hydration" className="text-xs gap-1 py-2">
                <Droplets className="h-3 w-3" /> Hydratace
              </TabsTrigger>
              <TabsTrigger value="real-sim" className="text-xs gap-1 py-2">
                <Zap className="h-3 w-3" /> Simulace
              </TabsTrigger>
              <TabsTrigger value="simulation" className="text-xs gap-1 py-2">
                <Play className="h-3 w-3" /> Quick Seed
              </TabsTrigger>
              <TabsTrigger value="integrity" className="text-xs gap-1 py-2">
                <Shield className="h-3 w-3" /> Integrita
              </TabsTrigger>
              <TabsTrigger value="seed" className="text-xs gap-1 py-2">
                <Sprout className="h-3 w-3" /> Seed
              </TabsTrigger>
              <TabsTrigger value="seed-map" className="text-xs gap-1 py-2">
                <Map className="h-3 w-3" /> Seed Map
              </TabsTrigger>
              <TabsTrigger value="qa" className="text-xs gap-1 py-2">
                <FlaskConical className="h-3 w-3" /> QA
              </TabsTrigger>
              <TabsTrigger value="economy-qa" className="text-xs gap-1 py-2">
                <BarChart3 className="h-3 w-3" /> Econ QA
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="local-sim" className="text-xs gap-1 py-2">
            <Compass className="h-3 w-3" /> Lokální simulace
          </TabsTrigger>
          <TabsTrigger value="event-engine" className="text-xs gap-1 py-2">
            <Info className="h-3 w-3" /> Event Engine
          </TabsTrigger>
          <TabsTrigger value="observatory" className="text-xs gap-1 py-2">
            <Telescope className="h-3 w-3" /> Observatory
          </TabsTrigger>
          <TabsTrigger value="node-spawner" className="text-xs gap-1 py-2">
            <MapPinPlus className="h-3 w-3" /> Node Spawner
          </TabsTrigger>
          <TabsTrigger value="node-editor" className="text-xs gap-1 py-2">
            <Settings2 className="h-3 w-3" /> Node Editor
          </TabsTrigger>
        </TabsList>

        {perms.canRunServerDevTools && (
          <>
            <TabsContent value="hydration" className="mt-3">
              <HydrationSection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="real-sim" className="mt-3">
              <RealSimulationSection sessionId={sessionId} currentPlayerName={currentPlayerName} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="simulation" className="mt-3">
              <SimulationSection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="integrity" className="mt-3">
              <WorldIntegritySection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="seed" className="mt-3">
              <SeedSection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="qa" className="mt-3">
              <QATestSection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="economy-qa" className="mt-3">
              <EconomyQASection sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
            <TabsContent value="seed-map" className="mt-3">
              <SeedMapManager sessionId={sessionId} onRefetch={onRefetch} />
            </TabsContent>
          </>
        )}

        <TabsContent value="local-sim" className="mt-3">
          <LocalSimulationSection sessionId={sessionId} currentPlayerName={currentPlayerName} onRefetch={onRefetch} />
        </TabsContent>

        <TabsContent value="event-engine" className="mt-3">
          <EventEngineSection />
        </TabsContent>

        <TabsContent value="observatory" className="mt-3">
          <ObservatoryPanel sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="node-spawner" className="mt-3">
          <DevNodeSpawner sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>

        <TabsContent value="node-editor" className="mt-3">
          <DevNodeEditor sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DevModePanel;
