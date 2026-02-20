import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bug, Droplets, Play, Shield, Sprout, FlaskConical, BarChart3 } from "lucide-react";
import HydrationSection from "@/components/dev/HydrationSection";
import SimulationSection from "@/components/dev/SimulationSection";
import WorldIntegritySection from "@/components/dev/WorldIntegritySection";
import SeedSection from "@/components/dev/SeedSection";
import QATestSection from "@/components/dev/QATestSection";
import EconomyQASection from "@/components/dev/EconomyQASection";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

const DevModePanel = ({
  sessionId, currentPlayerName, onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {

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
      <Tabs defaultValue="hydration" className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto">
          <TabsTrigger value="hydration" className="text-xs gap-1 py-2">
            <Droplets className="h-3 w-3" /> Hydratace
          </TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs gap-1 py-2">
            <Play className="h-3 w-3" /> Simulace
          </TabsTrigger>
          <TabsTrigger value="integrity" className="text-xs gap-1 py-2">
            <Shield className="h-3 w-3" /> Integrita
          </TabsTrigger>
          <TabsTrigger value="seed" className="text-xs gap-1 py-2">
            <Sprout className="h-3 w-3" /> Seed
          </TabsTrigger>
          <TabsTrigger value="qa" className="text-xs gap-1 py-2">
            <FlaskConical className="h-3 w-3" /> QA
          </TabsTrigger>
          <TabsTrigger value="economy-qa" className="text-xs gap-1 py-2">
            <BarChart3 className="h-3 w-3" /> Econ QA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hydration" className="mt-3">
          <HydrationSection sessionId={sessionId} onRefetch={onRefetch} />
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
      </Tabs>
    </div>
  );
};

export default DevModePanel;
