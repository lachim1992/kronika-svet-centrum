import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Users, EyeOff } from "lucide-react";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SystemGraphPanel = lazy(() => import("./SystemGraphPanel"));
const AgencyMapPanel = lazy(() => import("./AgencyMapPanel"));
const HiddenMetricsPanel = lazy(() => import("./HiddenMetricsPanel"));

const Fallback = () => <Skeleton className="h-[400px] w-full rounded-lg" />;

const ObservatoryPanel = () => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Systémové MRI — read-only vizualizace všech mechanik, vazeb a slepých míst.
      </p>

      <Tabs defaultValue="system-graph" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="system-graph" className="text-xs gap-1 py-2">
            <Network className="h-3 w-3" /> System Graph
          </TabsTrigger>
          <TabsTrigger value="agency-map" className="text-xs gap-1 py-2">
            <Users className="h-3 w-3" /> Agency Map
          </TabsTrigger>
          <TabsTrigger value="hidden-metrics" className="text-xs gap-1 py-2">
            <EyeOff className="h-3 w-3" /> Hidden Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system-graph" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <SystemGraphPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="agency-map" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <AgencyMapPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="hidden-metrics" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <HiddenMetricsPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ObservatoryPanel;
